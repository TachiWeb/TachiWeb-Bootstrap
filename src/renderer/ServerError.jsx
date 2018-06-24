import React, { Component } from 'react'
import { ipcRenderer, shell } from 'electron'
import { Modal, Button } from 'semantic-ui-react'

export default class ServerError extends Component {
    render() {
        return (
            <Modal
                open={this.props.open}
                closeOnEscape={false}
                closeOnRootNodeClick={false} >
                <Modal.Header>Failed to start server</Modal.Header>
                <Modal.Content>
                    <p>
                        TachiWeb encountered an error during startup. Please report this to the developers.
                    </p>
                </Modal.Content>
                <Modal.Actions>
                    <Button negative onClick={ServerError.quit}>Quit</Button>
                </Modal.Actions>
            </Modal>
        )
    }

    static quit() {
        ipcRenderer.send('quit')
    }
}