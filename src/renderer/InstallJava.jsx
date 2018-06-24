import React, { Component } from 'react'
import { ipcRenderer, shell } from 'electron'
import { Modal, Button } from 'semantic-ui-react'

export default class InstallJava extends Component {
    render() {
        return (
            <Modal
                open={this.props.open}
                closeOnEscape="false"
                closeOnRootNodeClick="false" >
                <Modal.Header>Java installation required</Modal.Header>
                <Modal.Content>
                    <p>
                        TachiWeb cannot be started unless Java is installed. Upon pressing the "quit" button, you will be taken to the Java download website.
                        Download and install Java from the website. Once Java is installed, re-launch TachiWeb.
                    </p>
                </Modal.Content>
                <Modal.Actions>
                    <Button negative onClick={InstallJava.javaQuit}>Quit</Button>
                </Modal.Actions>
            </Modal>
        )
    }

    static javaQuit() {
        shell.openExternal("https://java.com/download")

        ipcRenderer.send('quit')
    }
}