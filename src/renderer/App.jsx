import React, {Component} from 'react'
import {findDOMNode} from 'react-dom'
import {Container, Form, Header, Image, Progress, TextArea} from 'semantic-ui-react'
import * as path from 'path'
import TachiyomiIcon from './assets/icon.png'
import detect from 'detect-port'
import LocateJavaHome from 'locate-java-home'
import {ipcRenderer, remote} from 'electron'
import {Helmet} from 'react-helmet'
import mkdirp from 'mkdirp2'
import AdmZip from 'adm-zip'
import fs from 'fs'
import InstallJava from "./InstallJava"
import ServerError from "./ServerError"
import staticPath from "./staticPath"

const PATCH_NAME = "java.base-patch.jar"
const PATCH_LOCATION = "patches/" + PATCH_NAME

const DEFAULT_PORT = 4567
const APP_PATH = path.join(remote.app.getPath("appData"), "TachiWeb")
const TW_CONFIG_FOLDER = path.join(APP_PATH, "tachiserver-data", "config")
const TW_PATCH_EXTRACT_LOCATION = path.join(APP_PATH, "tachiserver-data", "patches")
const TW_CONFIG = path.join(TW_CONFIG_FOLDER, "bootstrap.conf")
const HTTP_BOOT_MESSAGE = "HTTP-SERVER-BOOTED"

const TW_BINARY = path.join(staticPath, "tachiserver.jar")

export default class App extends Component {
    constructor(props) {
        super(props);
        this.logRef = React.createRef();
        this.mounted = false

        this.state = {
            percent: 0,
            task: 'Please wait...',
            log: [],
            javaError: false,
            serverError: false
        }
    }

    render() {
        return (
            <Container textAlign='center'>
                <Helmet>
                    <meta charSet="utf-8" />
                    <title>TachiWeb - Starting</title>
                </Helmet>
                <Image src={ TachiyomiIcon } size='small' centered />
                <Header as='h1' icon textAlign='center'>
                    <Header.Content>TachiWeb</Header.Content>
                </Header>

                <p>
                    TachiWeb is starting up...
                </p>

                <Progress percent={this.state.percent} indicating progress>
                    {this.state.task}
                </Progress>

                <Form>
                    <TextArea ref={this.logRef} value={this.state.log.join("\n")} rows="10" disabled/>
                </Form>

                <InstallJava open={this.state.javaError}/>
                <ServerError open={this.state.serverError}/>
            </Container>
        )
    }

    log(entry) {
        console.log(entry)

        if (this.mounted) {
            this.setState({
                log: this.state.log.concat([entry])
            })

            if (this.logRef.current) {
                let dom = findDOMNode(this.logRef.current)
                dom.scrollTop = dom.scrollHeight;
            }
        }
    }

    task(task) {
        this.setState({
            task: task
        })

        this.log(task)
    }

    percent(percent) {
        this.setState({
            percent: percent
        })
    }

    componentDidMount() {
        this.mounted = true

        this.task(`Looking for available port (default is: ${DEFAULT_PORT})...`)
        detect(DEFAULT_PORT, (err, _port) => {
            let chosenPort

            if (err) {
                this.log("An error occurred while searching for ports, using default port anyways... " + err);
                chosenPort = DEFAULT_PORT
            }

            if (DEFAULT_PORT === _port) {
                this.log(`Default port was not occupied`);
                chosenPort = DEFAULT_PORT
            } else {
                this.log(`Default port was occupied, but found available port: ${_port}`);
                chosenPort = _port
            }

            this.percent(33)
            this.searchForJava(chosenPort)
        });
    }

    componentWillUnmount() {
        this.mounted = false
    }

    searchForJava(chosenPort) {
        this.task("Searching for Java...")
        let that = this
        this.tryFindJava(function (err, binary, isJava8) {
            if(err) {
                that.log("Unable to find Java!")
                that.setState({javaError: true})
                return;
            }

            that.log(`Found Java ${isJava8 ? "1.8" : "9+"} binary at: ${binary}!`);
            that.percent(50)
            that.configureApp(binary, isJava8, chosenPort)
        });
    }

    configureApp(javaBin, isJava8, chosenPort) {
        this.task("Configuring application...")
        this.log("App data directory: " + APP_PATH)
        this.log("Configuration location: " + TW_CONFIG)
        mkdirp.mkdirP(TW_CONFIG_FOLDER, {}, () => {
            this.percent(60)

            this.log("Building config...")
            let config = "ts.server.port=" + chosenPort
            config += "\nts.server.httpInitializedPrintMessage=" + HTTP_BOOT_MESSAGE

            this.log("Writing config...")
            fs.writeFile(TW_CONFIG, config, () => {
                this.percent(70)

                this.log("Extracting patches...")
                let zipFile = new AdmZip(TW_BINARY)
                zipFile.extractEntryTo(PATCH_LOCATION, TW_PATCH_EXTRACT_LOCATION, false, true)
                this.percent(80)

                let patchArgs;
                if (isJava8) {
                    patchArgs = ["-Xbootclasspath/p:" + TW_PATCH_EXTRACT_LOCATION];
                } else {
                    patchArgs = ["--patch-module", "java.base=" + TW_PATCH_EXTRACT_LOCATION, "--add-reads", "java.base=java.logging"];
                }

                let args = patchArgs.concat(["-Dts.bootstrap.active=true", "-jar", TW_BINARY])
                this.task("Starting server...")
                this.log("Running command: " + [javaBin].concat(args).join(" "))

                let bootPort = chosenPort

                ipcRenderer.send('boot-server', {
                    command: javaBin,
                    args: args,
                    options: {cwd: APP_PATH},
                    port: chosenPort
                })

                ipcRenderer.on('server-change-port', (event, port) => {
                    bootPort = port
                })

                ipcRenderer.on('server-stdout', (event, token) => {
                    this.log("[SERVER-STDOUT] " + token)
                    if (this.mounted) {
                        if (token.trim() === HTTP_BOOT_MESSAGE) {
                            this.percent(100)
                            this.task("Launching UI...")

                            window.location = "http://127.0.0.1:" + bootPort
                        }
                    }
                })

                ipcRenderer.on('server-stderr', (event, token) => {
                    this.log("[SERVER-STDERR] " + token)
                })

                ipcRenderer.on('server-death', (event, exitCode) => {
                    this.log("Process exited with code: " + exitCode)

                    if (this.mounted) {
                        this.setState({serverError: true})
                    }
                })

                this.percent(90)
            })
        })
    }

    tryFindJava(callback) {
        this.tryFindJavaVersion("~1.8", (error, binary) => {
            if (!error) {
                callback(null, binary, true)
            } else {
                this.tryFindJavaVersion(">=1.9", (error, binary) => {
                    if (!error) {
                        callback(null, binary, false)
                    } else callback(error)
                })
            }
        })
    }

    tryFindJavaVersion(versionString, callback) {
        LocateJavaHome({
            version: versionString,
            mustBeJDK: false,
            mustBeJRE: false,
            mustBe64Bit: false
        }, function (error, javaHomes) {
            if (error || javaHomes.length <= 0) {
                callback("Unable to find Java home")
                return
            }

            let javaHome = javaHomes[0];
            let binary = javaHome.executables.java

            if (fs.existsSync(binary)) {
                callback(null, binary)
            } else {
                callback("Unable to find Java binary")
            }
        })
    }
}

