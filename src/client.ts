import nodeIPC from 'node-ipc';
import EventEmitter from 'events'

export class EmailClient {

    socketPath: string = "/opt/EmailService/email.sock"
    ready: boolean = false
    eventListener: EventEmitter = new EventEmitter()
    connected: boolean = false
    
    constructor(socketPath?: string) {
        if (socketPath) this.socketPath = socketPath

        nodeIPC.config.silent = true
        nodeIPC.config.id = "email"


        nodeIPC.connectTo("email", this.socketPath, () => {
            nodeIPC.of.email.on("connect", () => {
                this.ready = true
                this.connected = true
                nodeIPC.of.email.on("authenticated", (data) => {
                    this.eventListener.emit("authenticated", data)
                })
            })
            nodeIPC.of.email.on("disconnect", () => {
                this.connected = false
                this.ready = false
            })
            nodeIPC.of.email.on("socket.disconnected", () => {
                this.connected = false
                this.ready = false
            })
        })
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {

            if (nodeIPC.of.email) resolve()
            nodeIPC.connectTo("email", this.socketPath, () => {
                nodeIPC.of.email.on("connect", () => {
                    this.ready = true
                    this.connected = true
                    resolve()
                })
                nodeIPC.of.email.on("disconnect", () => {
                    this.connected = false
                    this.ready = false
                    reject()
                })
                nodeIPC.of.email.on("socket.disconnected", () => {
                    this.connected = false
                    this.ready = false
                    reject()
                })
            })
        })
    }

    async waitForReady(): Promise<void> {
        return new Promise((resolve) => {
            if (this.ready) resolve()
            else {
                nodeIPC.of.email.on("connect", () => {
                    this.ready = true
                    resolve()
                })
            }
        })
    }

    async getAuthURL(): Promise<string> {
        if (!this.ready) throw new Error("Not connected to server")
        return new Promise((resolve, reject) => {
            nodeIPC.of.email.emit("getAuthURL")
            nodeIPC.of.email.on("authURL", (data) => {
                resolve(data)
            })
        })
    }

    async getAuthenticatedAs(): Promise<string> {
        if (!this.ready) throw new Error("Not connected to server")
        return new Promise((resolve, reject) => {
            nodeIPC.of.email.emit("getAuthenticatedAs")
            nodeIPC.of.email.on("getAuthenticatedAs", (data) => {
                if (data.error) reject(data.error)
                else resolve(data.email)
            })
        })
    }

    async sendEmail(email: {fromAddress: string, toAddress: string, subject: string, content: string}): Promise<void> {
        if (!this.ready) throw new Error("Not connected to server")
        return new Promise((resolve, reject) => {
            nodeIPC.of.email.emit("email", email)
            nodeIPC.of.email.on("email", (data) => {
                if (data.status === "OK") resolve()
                else if (data.error) reject(data.error)
                else reject(data)
            })
        })
    }

    async isAuthenticated(): Promise<boolean> {
        if (!this.ready) throw new Error("Not connected to server")
        return new Promise((resolve, reject) => {
            nodeIPC.of.email.emit("isAuthenticated")
            nodeIPC.of.email.on("isAuthenticated", (data) => {
                resolve(data.status)
            })
        })
    }


    async close() {
        nodeIPC.disconnect("email")
    }


}