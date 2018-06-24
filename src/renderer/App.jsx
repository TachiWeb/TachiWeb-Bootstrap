import React, {Component} from 'react'
import {findDOMNode} from 'react-dom'
import { Header, Image, Container, Progress, TextArea, Form } from 'semantic-ui-react'
import * as path from 'path'
import TachiyomiIcon from './assets/icon.png'
import detect from 'detect-port'
import findJavaHome from 'find-java-home'
import { remote, ipcRenderer } from 'electron'
import { Helmet } from 'react-helmet'
import { spawn } from 'child_process'
import mkdirp from 'mkdirp2'
import fs from 'fs'
import streamSplitter from 'stream-splitter'
import InstallJava from "./InstallJava";
import ServerError from "./ServerError";

const DEFAULT_PORT = 4567
const APP_PATH = path.join(remote.app.getPath("appData"), "TachiWeb")
const TW_CONFIG_FOLDER = path.join(APP_PATH, "tachiserver-data", "config")
const TW_CONFIG = path.join(TW_CONFIG_FOLDER, "bootstrap.conf")
const HTTP_BOOT_MESSAGE = "HTTP-SERVER-BOOTED"

const TW_BINARY = path.join(__static, "tachiserver.jar")

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

        this.setState({
            log: this.state.log.concat([entry])
        })

        if(this.logRef.current) {
            let dom = findDOMNode(this.logRef.current)
            dom.scrollTop = dom.scrollHeight;
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
        findJavaHome({allowJre: true}, function(err, home){
            if(err) {
                that.log("Unable to find Java!")
                that.setState({javaError: true})
                return;
            }

            that.log(`Found JAVA_HOME at: ${home}!`);
            that.percent(50)

            let javaFolder = path.join(home, "bin")
            let windowsJava = path.join(javaFolder, "java.exe")
            let unixJava = path.join(javaFolder, "java")
            let theJava

            if(fs.existsSync(windowsJava)) {
                theJava = windowsJava
            } else if(fs.existsSync(unixJava)) {
                theJava = unixJava
            } else {
                that.log("Unable to find Java binary!")
                that.setState({javaError: true})
                return;
            }

            that.log(`Found java binary at: ${theJava}!`);

            that.percent(66)
            that.configureApp(theJava, chosenPort)
        });
    }

    configureApp(javaBin, chosenPort) {
        this.task("Configuring application...")
        this.log("App data directory: " + APP_PATH)
        this.log("Configuration location: " + TW_CONFIG)
        mkdirp.mkdirP(TW_CONFIG_FOLDER, {}, () => {
            this.percent(70)

            this.log("Building config...")
            let config = "ts.server.port=" + chosenPort
            config += "\nts.server.httpInitializedPrintMessage=" + HTTP_BOOT_MESSAGE

            this.log("Writing config...")
            fs.writeFileSync(TW_CONFIG, config)
            this.percent(80)

            let args = ["-jar", TW_BINARY]
            this.task("Starting server...")
            this.log("Running command: " + [javaBin].concat(args).join(" "))
            let proc = spawn(javaBin, args, { cwd: APP_PATH })

            ipcRenderer.send('pid-queue', proc.pid)

            this.percent(90)

            proc.stdout.setEncoding('utf8');
            let splitter = proc.stdout.pipe(streamSplitter("\n"))
            splitter.encoding = "utf8"
            splitter.on("token", (token) => {
                this.log()
                if(token.trim() === HTTP_BOOT_MESSAGE) {
                    this.percent(100)
                    this.task("Launching UI...")

                    window.location = "http://127.0.0.1:" + chosenPort
                }
            });

            proc.on('exit', () => {
                this.log("Process exited with code: " + proc.exitCode)

                if(this.mounted) {
                    this.setState({serverError: true})
                }
            })
        })
    }
}

