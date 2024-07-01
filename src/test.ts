import { EmailClient } from "./client";


(async ()=>{

    const client = new EmailClient(process.platform == "win32" ? "EmailSocket" : "/tmp/email.sock")
    await client.waitForReady()

    
    async function waitUntilAuthenticated() {
        if (await client.isAuthenticated()) return
        return new Promise((resolve) => {
            client.eventListener.on("authenticated", resolve)
        })
    }


    const isAuthed = await client.isAuthenticated()
    let fromAddress = null

    if (!isAuthed) {
        const authURL = await client.getAuthURL()
        console.log("Please visit this URL to authenticate: ", authURL)
        await waitUntilAuthenticated()
        fromAddress = await client.getAuthenticatedAs()
        console.log("Authenticated as ", fromAddress)
    }



    console.log("Sending email to user@example.com")
    await client.sendEmail({
        fromAddress: fromAddress,
        toAddress: "user@example.com",
        subject: "Hello!",
        content: "<h1>Good job on making this library work! The content field supports both HTML and plain text :)</h1>",
    }).then(() => {
        console.log("Email sent")
        client.close()
    }).catch((err) => {
        console.log(err)
        client.close()
    })
})()