import nodeIPC from 'node-ipc';
import {config} from 'dotenv'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import express from 'express'

config()

let aToken = process.env.ATOKEN || ""
let rToken = process.env.RTOKEN || ""
let tokenExpires = process.env.TOKENEXPIRES as string ? new Date(process.env.TOKENEXPIRES as string) : ""
let reg = process.env.REGION || "com" //! .*

const redirect_uri = process.env.REDIRECT_URI || "http://localhost:7380"
const cID = process.env.CID
const cSecret = process.env.CSECRET

let PORT = redirect_uri.split(":")[redirect_uri.split(":").length - 1]

if (isNaN(PORT as any)) {
    PORT = "7380"
}

if (!cID || !cSecret || !redirect_uri) {
    console.error("No client ID, client secret or redirect URI found in .env file")
    process.exit(1)
}

const socketPath = process.platform == "win32" ? "EmailSocket" : "/tmp/email.sock"

async function isValidToken(aToken: string) {
    let response = await axios.get(`https://mail.zoho.${reg}/api/accounts`, {
        headers: {
            Authorization: `Zoho-oauthtoken ${aToken}`
        }
    })
    return response.status === 200
}

let scopes = [
    "ZohoMail.messages.CREATE",
    "ZohoMail.accounts.READ",
]

let refreshTokenTimer: NodeJS.Timeout

async function saveTokens() {
    // edit .env file to save tokens

    let env = fs.readFileSync(".env").toString().split("\n")
    let aTokenExists = false;
    let rTokenExists = false;
    let tokenExpiresExists = false;
    let regExists = false;


    env = env.map((line) => {
        if (line.startsWith("ATOKEN=")) {
            aTokenExists = true;
            return `ATOKEN=${aToken}`
        } else if (line.startsWith("RTOKEN=")) {
            rTokenExists = true;
            return `RTOKEN=${rToken}`
        } else if (line.startsWith("TOKENEXPIRES=")) {
            tokenExpiresExists = true;
            return `TOKENEXPIRES=${(tokenExpires as Date).getTime()}`
        } else if (line.startsWith("REGION=")) {
            regExists = true;
            return `REGION=${reg}`
        } else {
            return line
        }
    })

    if (!aTokenExists) env.push(`ATOKEN=${aToken}`);
    if (!rTokenExists) env.push(`RTOKEN=${rToken}`);
    if (!tokenExpiresExists) env.push(`TOKENEXPIRES=${(tokenExpires as Date).getTime()}`);
    if (!regExists) env.push(`REGION=${reg}`);


    fs.writeFileSync(".env", env.join("\n"))

    return true

}

async function refreshToken() {
    if (tokenExpires && new Date() < tokenExpires) return {
        aToken,
        rToken,
        tokenExpires,
        reg
    }
    let response = await axios.post(`https://accounts.zoho.${reg}/oauth/v2/token?refresh_token=${rToken}&grant_type=refresh_token&client_id=${cID}&client_secret=${cSecret}&redirect_uri=${redirect_uri}&scope=${scopes.join(",")}`, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    })

    if (refreshTokenTimer) clearTimeout(refreshTokenTimer)
    refreshTokenTimer = setTimeout(() => {
        refreshToken()
    }, response.data.expires_in * 1000 - 20)

    
    aToken = response.data.access_token || aToken
    rToken = response.data.refresh_token || rToken
    tokenExpires = new Date(new Date().getTime() + response.data.expires_in * 1000)
    reg = response.data.api_domain.split(".")[response.data.api_domain.split(".").length - 1]

    
    saveTokens()

    return {
        aToken: response.data.access_token,
        rToken: response.data.refresh_token,
        tokenExpires: new Date(new Date().getTime() + response.data.expires_in * 1000),
        reg: response.data.api_domain.split(".")[response.data.api_domain.split(".").length - 1]
    }
}

async function getAccountID(fromAddress: string) {

    const getAllAccounts = `https://mail.zoho.${reg}/api/accounts`
    const allAccountsResponse = await axios.get(getAllAccounts, {
        headers: {
            Authorization: `Zoho-oauthtoken ${aToken}`,
            Accept: "application/json"
        }
    })


    const desiredAcc = allAccountsResponse.data.data.find((acc: any) => acc.emailAddress.some((email: { mailId: string }) => {
        return email.mailId == fromAddress
    }))

    return desiredAcc?.accountId || null
    
}

(async()=>{
    nodeIPC.serve(socketPath, async () => {
        nodeIPC.config.id = "email"
        nodeIPC.config.silent = true
        if (rToken) await refreshToken()
        else {

            const app = express()
            app.use(express.json())

            app.get("/", async (req, res) => {
                const code = req.query.code
                reg = (req.query["accounts-server"] as string).split(".")[(req.query["accounts-server"] as string).split(".").length - 1]

                if (!code) {
                    return res.send("No code")
                }


                
                const tokenURL = `https://accounts.zoho.${reg}/oauth/v2/token?code=${code}&grant_type=authorization_code&client_id=${cID}&client_secret=${cSecret}&redirect_uri=${redirect_uri}&scope=${scopes.join(",")}`
                let tokenResponse = await axios.post(tokenURL)


                aToken = tokenResponse.data.access_token || aToken
                rToken = tokenResponse.data.refresh_token || rToken
                reg = tokenResponse.data.api_domain.split(".")[tokenResponse.data.api_domain.split(".").length - 1] || reg
                tokenExpires = new Date(new Date().getTime() + tokenResponse.data.expires_in * 1000) || tokenExpires

                res.send("Authenticated successfully")
                nodeIPC.server.broadcast("authenticated", {
                    status: "OK"
                })

                saveTokens()

                if (refreshTokenTimer) clearTimeout(refreshTokenTimer)
                refreshTokenTimer = setTimeout(() => {
                    refreshToken()
                }, tokenResponse.data.expires_in * 1000 - 20)

                expressServer.close()
            })

            const expressServer = app.listen(parseInt(PORT), () => {
                console.log(`Listening on port ${parseInt(PORT)}`)
            })

        }

    
        nodeIPC.server.on("email", async (data, socket) => {

            for (let i of Object.keys({...data})) {
                if (["fromAddress", "toAddress", "subject", "content"].indexOf(i) === -1) {   
                    nodeIPC.server.emit(socket, "email", {
                        error: "Invalid data"
                    })
                    return
                }
            }


            const emailData: {fromAddress: string, toAddress: string, subject: string, content: string} = data

            if (!aToken) {
                nodeIPC.server.emit(socket, "email", {
                    error: "Not authenticated"
                })
                return
            }

            let accID = await getAccountID(emailData.fromAddress)

            if (!accID) {
                nodeIPC.server.emit(socket, "email", {
                    error: "No account found for this email address"
                })
                return
            }

            const sendEmail = `https://mail.zoho.${reg}/api/accounts/${accID}/messages`

            console.log("Sending requested email from", emailData.fromAddress, "to", emailData.toAddress, "with subject", emailData.subject?? "[No subject]")

            await axios.post(sendEmail, JSON.stringify(emailData), {
                headers: {
                    Authorization: `Zoho-oauthtoken ${aToken}`,
                    Accept: "application/json",
                    "Content-Type": "application/json"
                }
            }).then(() => {
                nodeIPC.server.emit(socket, "email", {
                    status: "OK"
                })
            }).catch((err) => {
                nodeIPC.server.emit(socket, "email", {
                    error: err
                })
            })
        })
        
        nodeIPC.server.on("getAuthURL", (data, socket) => {
            let AuthURL = `https://accounts.zoho.${reg}/oauth/v2/auth?scope=${scopes}&client_id=${cID}&response_type=code&access_type=offline&redirect_uri=${redirect_uri}&prompt=consent`
            nodeIPC.server.emit(socket, "authURL", AuthURL)
        })

        nodeIPC.server.on("isAuthenticated", (data, socket) => {
            nodeIPC.server.emit(socket, "isAuthenticated", {
                status: aToken ? true : false
            })
        })

        nodeIPC.server.on("getAuthenticatedAs", (data, socket) => {
           
            if (!aToken) {
                nodeIPC.server.emit(socket, "getAuthenticatedAs", {
                    email: null
                })
                return
            }

            axios.get(`https://mail.zoho.${reg}/api/accounts`, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${aToken}`
                }
            }).then((response) => {
                nodeIPC.server.emit(socket, "getAuthenticatedAs", {
                    email: response.data.data[0].mailboxAddress
                })
            }).catch((err) => {
                nodeIPC.server.emit(socket, "getAuthenticatedAs", {
                    error: err
                })
            })
        })

        nodeIPC.server.on("connect", () => {
            console.log("Connected")
        })
        
        nodeIPC.server.on("disconnect", () => {
            console.log("Disconnected")
        })
    })
    
    nodeIPC.server.start()
})()