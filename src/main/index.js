'use strict'

import {app, BrowserWindow, ipcMain, Menu, shell, Tray} from 'electron'
import * as path from 'path'
import {format as formatUrl} from 'url'
import {spawn} from 'child_process'
import streamSplitter from 'stream-splitter'

const isDevelopment = process.env.NODE_ENV !== 'production'

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let mainWindow
let tray

const iconPath = path.join(__static, '/icon.png')
const iconPath64 = path.join(__static, '/icon64.png')

const hasSingleInstance = app.requestSingleInstanceLock()

let isQuitting = false
let hasKilledApp = false;

let serverPort = -1
let serverProcess = null

if (!hasSingleInstance) {
    isQuitting = true
    app.quit()
} else {
    app.on('second-instance', () => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            mainWindow.show()
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        }
    })

    app.on('activate', () => {
        // on macOS it is common to re-create a window even after all windows have been closed
        if (mainWindow === null) {
            mainWindow = createMainWindow()
        }
    })

    // quit application when all windows are closed
    app.on('window-all-closed', () => {
        isQuitting = true
        app.quit()
    })

    // create main BrowserWindow when electron is ready
    app.on('ready', () => {
        mainWindow = createMainWindow()

        tray = new Tray(iconPath64)
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show window',
                click: () => {
                    mainWindow.show()
                }
            },
            {
                label: 'Quit',
                click: () => {
                    isQuitting = true
                    app.quit()
                }
            }
        ])
        tray.on('click', () => {
            mainWindow.show()
            mainWindow.focus()
        })
        tray.setToolTip('TachiWeb is running')
        tray.setContextMenu(contextMenu)

        mainWindow.on('minimize', function (event) {
            event.preventDefault()
            mainWindow.hide()
        })

        mainWindow.on('close', function (event) {
            if(!isQuitting) {
                event.preventDefault()
                mainWindow.hide()
            }
        });
    })

    ipcMain.on('boot-server', (event, args) => {
        if (serverProcess != null) {
            console.log(`Attempted to start server with ${args} when server is already running on: ${serverPort}!`)
            mainWindow.webContents.send('server-change-port', serverPort)
            return;
        }

        console.log(`Spawning server with: ${args}`)
        serverProcess = spawn(args.command, args.args, args.options)
        serverPort = args.port

        serverProcess.stdout.setEncoding('utf8');
        serverProcess.stderr.setEncoding('utf8');
        let splitter = serverProcess.stdout.pipe(streamSplitter("\n"))
        splitter.encoding = "utf8"
        splitter.on("token", (token) => {
            console.log("[SERVER-STDOUT] " + token + "\n")
            mainWindow.webContents.send('server-stdout', token)
        })

        let stdErrSplitter = serverProcess.stderr.pipe(streamSplitter("\n"))
        stdErrSplitter.encoding = "utf8"
        stdErrSplitter.on("token", (token) => {
            console.log("[SERVER-STDERR] " + token + "\n")
            mainWindow.webContents.send('server-stderr', token)
        })

        serverProcess.on('exit', (code) => {
            serverProcess = null
            mainWindow.webContents.send('server-death', code)
        })
    })

    let killProcs = (callback) => {
        if (serverProcess != null) {
            // TODO Try killing server via API call before doing this
            //   as killing the server like this on Window may result in data corruption
            console.log("Killing: " + serverProcess.pid)
            serverProcess.kill()
            serverProcess = null
        }

        callback()
    }

    let killAppAndProcs = () => {
        isQuitting = true
        killProcs(() => {
            if (!hasKilledApp) {
                hasKilledApp = true
                app.quit()
            }
        })
    }

    // Make sure that JVM dies at all costs
    app.on('will-quit', killAppAndProcs)
    app.on('before-quit', killAppAndProcs)
    process.on('SIGINT', killAppAndProcs); // catch ctrl-c
    process.on('SIGTERM', killAppAndProcs); // catch kill

    ipcMain.on('quit', () => {
        isQuitting = true
        app.quit()
    })
}

function createMainWindow() {
    const window = new BrowserWindow({
        icon: iconPath
    })
    window.setMenu(null)

    // if (isDevelopment) {
    //     window.webContents.openDevTools()
    // }

    if (isDevelopment) {
        window.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}`)
    }
    else {
        window.loadURL(formatUrl({
            pathname: path.join(__dirname, 'index.html'),
            protocol: 'file',
            slashes: true
        }))
    }

    window.webContents.on('devtools-opened', () => {
        window.focus()
        setImmediate(() => {
            window.focus()
        })
    })

    // Open new windows in browser window
    window.webContents.on('new-window', (event, url) => {
        event.preventDefault()
        shell.openExternal(url)
    })

    ipcMain.on('open-dev-console', () => {
        window.webContents.openDevTools()
    })

    return window
}
