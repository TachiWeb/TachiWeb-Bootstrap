import React from 'react'
import {render} from 'react-dom'
import App from './App.jsx'
import './global.css';
import Mousetrap from 'mousetrap'
import { ipcRenderer } from 'electron'

Mousetrap.bind('ctrl+shift+i', () => {
    ipcRenderer.send('open-dev-console')
})

render(
    <App />,
    document.getElementById('app')
)