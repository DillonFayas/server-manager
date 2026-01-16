#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const readline = require('readline');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const EXAMPLE_FILE = path.join(__dirname, 'config.example.json');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m'
};

// Print colored message
function print(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

// Print banner
function printBanner() {
    console.log('\n' + colors.cyan + colors.bright);
    console.log('╔════════════════════════════════════╗');
    console.log('║     Server Manager Setup Tool      ║');
    console.log('╚════════════════════════════════════╝');
    console.log(colors.reset + '\n');
}

// Check if config exists
async function configExists() {
    try {
        await fs.access(CONFIG_FILE);
        return true;
    } catch {
        return false;
    }
}

// Load existing config
async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        const exampleData = await fs.readFile(EXAMPLE_FILE, 'utf8');
        return JSON.parse(exampleData);
    }
}

// Save config
async function saveConfig(config) {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Simple question function that creates its own readline instance
function ask(query) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// Password input - creates its own interface each time
function askPassword(query) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });
        
        // Manually write the prompt
        process.stdout.write(query);
        
        let password = '';
        
        // Listen to stdin directly for character-by-character input
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        
        const onData = (char) => {
            switch (char) {
                case '\n':
                case '\r':
                case '\u0004': // Ctrl+D
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    rl.close();
                    resolve(password);
                    break;
                case '\u0003': // Ctrl+C
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    rl.close();
                    process.exit(0);
                    break;
                case '\u007F': // Backspace
                case '\b':
                case '\x08':
                    if (password.length > 0) {
                        password = password.slice(0, -1);
                        process.stdout.write('\b \b');
                    }
                    break;
                default:
                    // Only accept printable characters
                    if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) < 127) {
                        password += char;
                        process.stdout.write('*');
                    }
                    break;
            }
        };
        
        process.stdin.on('data', onData);
    });
}

// Setup wizard
async function runSetup() {
    printBanner();

    const exists = await configExists();
    
    if (exists) {
        print('⚠️  Configuration file already exists!', 'yellow');
        const overwrite = await ask('Do you want to reconfigure? (yes/no): ');
        
        if (overwrite.toLowerCase() !== 'yes' && overwrite.toLowerCase() !== 'y') {
            print('\n✅ Setup cancelled. Your existing configuration is unchanged.', 'green');
            return;
        }
        print('');
    }

    const config = await loadConfig();

    // Server Configuration
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    print('SERVER CONFIGURATION', 'bright');
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    print('Press Enter to use the default value.\n', 'cyan');
    
    const port = await ask(`Port [default: ${config.server.port}]: `);
    if (port && port.trim()) config.server.port = parseInt(port.trim());

    const host = await ask(`Host [default: ${config.server.host}]: `);
    if (host && host.trim()) config.server.host = host.trim();

    // Password Configuration
    print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    print('PASSWORD CONFIGURATION', 'bright');
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    print('Enter a password for the web interface.', 'cyan');
    print('Password must be at least 4 characters.\n', 'cyan');
    
    let password = '';
    let passwordConfirm = '';
    let passwordMatch = false;

    while (!passwordMatch) {
        password = await askPassword('Password: ');
        
        if (!password || password.length < 4) {
            print('❌ Password must be at least 4 characters long.', 'red');
            continue;
        }

        passwordConfirm = await askPassword('Confirm password: ');
        
        if (password !== passwordConfirm) {
            print('❌ Passwords do not match. Please try again.\n', 'red');
            continue;
        }

        passwordMatch = true;
    }

    print('🔐 Hashing password...', 'cyan');
    config.auth.passwordHash = await bcrypt.hash(password, 10);
    print('✅ Password configured', 'green');

    // Email Configuration
    print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    print('EMAIL CONFIGURATION (Optional)', 'bright');
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    print('Configure email notifications for project crashes.', 'cyan');
    print('You need a Gmail account with an App Password.', 'cyan');
    print('Type "yes" to configure, or press Enter to skip.\n', 'yellow');

    const enableEmail = await ask('Enable email notifications? (yes/no) [default: no]: ');
    
    if (enableEmail.toLowerCase() === 'yes' || enableEmail.toLowerCase() === 'y') {
        config.email.enabled = true;

        print('\n📧 Gmail Account Setup', 'cyan');
        print('   This is the Gmail account that will SEND crash alerts.\n', 'cyan');
        
        let emailUser = '';
        while (!emailUser || !emailUser.includes('@')) {
            emailUser = await ask('Email to send reports FROM: ');
            if (!emailUser || !emailUser.includes('@')) {
                print('❌ Please enter a valid email address.', 'red');
            }
        }
        config.email.user = emailUser;

        print('\nℹ️  Gmail App Password Setup', 'cyan');
        print('   Enter your 16-character Gmail App Password for the sender account.', 'cyan');
        print('   (Spaces are optional and will be removed automatically)\n', 'cyan');
        
        let emailPass = '';
        while (!emailPass || emailPass.replace(/\s/g, '').length < 16) {
            emailPass = await askPassword('Gmail App Password: ');
            if (!emailPass || emailPass.replace(/\s/g, '').length < 16) {
                print('❌ App Password must be at least 16 characters.', 'red');
            }
        }
        config.email.pass = emailPass.replace(/\s/g, '');

        print('\n📬 Alert Recipient Setup', 'cyan');
        print('   This is where crash alerts will be sent.', 'cyan');
        print('   Press Enter to use the same email as sender.\n', 'cyan');
        
        const emailRecipient = await ask(`Email to RECEIVE reports AT [default: ${emailUser}]: `);
        config.email.recipient = (emailRecipient && emailRecipient.trim()) ? emailRecipient.trim() : emailUser;

        print('✅ Email notifications configured', 'green');
    } else {
        config.email.enabled = false;
        config.email.user = '';
        config.email.pass = '';
        config.email.recipient = '';
        print('ℹ️  Email notifications disabled', 'yellow');
    }

    // Save configuration
    print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    print('SAVING CONFIGURATION', 'bright');
    print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue');
    
    await saveConfig(config);
    
    print('✅ Configuration saved to config.json', 'green');
    print('\n🚀 You can now start the server with:', 'cyan');
    print('   npm start', 'bright');
    print('\n📝 To reconfigure later, run:', 'cyan');
    print('   npm run setup', 'bright');
    print('');
}

// Main
runSetup().catch(error => {
    print('\n❌ Setup failed: ' + error.message, 'red');
    console.error(error);
    process.exit(1);
});