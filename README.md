# Zoho-NodeAPI
This library allows you to send emails through Zoho Mail and NodeJS

This project has not been worked a lot on and will not be worked on a bunch since this repository is an addition to one of my more larger projects, [IRIS](https://github.com/Incoverse/IRIS). This repository only exists to allow people to use this method for sending emails.

But if you want to use this code for something else, go ahead!

## Usage
First you need to create an application on Zoho using the redirect URI that is specified in the .env file, you can change this to one of your own, or keep the original. After you've done that, you need to specify it's token and secret in the .env file. See .env.template for a template of the .env file

After that is done, install the required dependencies:
```bash
npm install
npm install typescript -g
```

Compile the source code:
```bash
tsc
```

Run the server!
```bash
npm run server
```

When the server is up and running, the server will create a named pipe named EmailService if you're running on Windows. Otherwise, the server will create a socket file at /tmp/email.sock

To check if everything is working, run the test file:
```bash
npm run test
```

When this runs you'll be required to authenticate the user you want to send emails from. This often only needs to be done once.
When that is done, a test email will be sent to user@example.com.