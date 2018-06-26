'use strict'

import { app, BrowserWindow, Menu, Tray, ipcMain } from 'electron'
import * as path from 'path'
import { format as formatUrl } from 'url'

const isDevelopment = process.env.NODE_ENV !== 'production'

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let mainWindow
let tray

const iconPath = path.join(__static, '/icon.png')
const iconPath32 = path.join(__static, '/icon32.png')

const hasSingleInstance = app.makeSingleInstance(() => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
        mainWindow.show()
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
    }
})

let isQuitting = false

if (hasSingleInstance) {
    isQuitting = true
    app.quit()
} else {
    app.on('activate', () => {
        // on macOS it is common to re-create a window even after all windows have been closed
        if (mainWindow === null) {
            mainWindow = createMainWindow()
        }
    })

    // create main BrowserWindow when electron is ready
    app.on('ready', () => {
        mainWindow = createMainWindow()

        tray = new Tray(iconPath32)
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

    ipcMain.on('pid-queue', (event, arg) => {
        let killProc = () => {
            try {process.kill(arg)} catch(e) {}
        }

        let killAppAndProc = () => {
            isQuitting = true
            app.quit()
            killProc()
        }

        // Make sure that process dies at all costs
        app.on('will-quit', killProc)
        app.on('before-quit', killProc)
        process.on('SIGINT', killAppAndProc); // catch ctrl-c
        process.on('SIGTERM', killAppAndProc); // catch kill
    });

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

    ipcMain.on('open-dev-console', () => {
        window.webContents.openDevTools()
    })

    return window
}
