# Server Manager

A comprehensive web-based dashboard for managing and monitoring projects on your Raspberry Pi or Linux server. Control your applications, view real-time logs, manage files, and execute commands from an intuitive web interface.

## 🌟 Features

### Project Management
- **Start/Stop/Restart** projects with a single click
- **Auto-restart** projects on system boot
- **Real-time status updates** via WebSocket connections
- **Git integration** - pull updates directly from the dashboard
- **Tags and filtering** - organize projects with custom tags
- **Crash tracking** - monitor project health and crash history

### Monitoring & Logging
- **Real-time log streaming** with WebSocket connections
- **CPU & Memory monitoring** with live updates every second
- **Process uptime tracking** with formatted display
- **Log filtering and search** - find what you need quickly
- **Log deduplication** - combine repeated log lines
- **Log export** - download logs as .txt files
- **Persistent log history** - logs remain between modal opens
- **Timestamps toggle** - show/hide log timestamps

### File Manager
- **Full file system browser** with breadcrumb navigation
- **File editing** with view/edit mode toggle
- **File upload** via drag-and-drop or file picker
- **Directory navigation** with up/refresh controls
- **File type icons** for easy identification

### Command Execution
- **Interactive terminal** - run commands in any directory
- **Directory browser** - navigate the file system visually
- **Command history** - use ↑↓ arrows to recall previous commands
- **Quick project directory access** - jump to project folders
- **Save commands as projects** - convert successful commands into managed projects

### Notifications & Alerts
- **Email crash notifications** - get alerted when projects fail
- **Crash history tracking** - view past crashes and exit codes
- **Real-time status indicators** with animated badges
- **Dismissable crash alerts** on project cards

### User Interface
- **Dark/Light theme** toggle
- **Responsive design** - works on desktop, tablet, and mobile
- **Mobile-friendly** hamburger menu
- **Password-protected** access
- **Clean, modern Bootstrap 5 UI**

## 📋 Requirements

- Node.js 14 or higher
- Linux/Unix system (Raspberry Pi, Ubuntu, Debian, etc.)
- `ps` command for resource monitoring
- Git (optional, for project updates)
- Gmail account with 2FA (optional, for email notifications)

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/DillonFayas/server-manager.git
cd server-manager
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Setup Wizard

Run the interactive setup wizard to configure your password, email notifications, and server settings:

```bash
npm run setup
```

The setup wizard will guide you through:

- **Server Configuration**: Port and host settings (default: 5000, 0.0.0.0)
- **Password Configuration**: Set your web interface password (minimum 4 characters)
- **Email Configuration** (Optional): 
  - Enable/disable email notifications
  - Configure Gmail App Password for crash alerts

#### Gmail App Password Setup (for Email Notifications)

If you choose to enable email notifications during setup, you'll need:

1. **Enable 2-Factor Authentication** on your Gmail account
   - Go to [Google Account](https://myaccount.google.com/) → Security
   - Enable 2-Step Verification

2. **Generate an App Password**
   - Go to Google Account → Security → 2-Step Verification
   - Scroll to "App passwords" (at the bottom)
   - Select app: "Mail"
   - Select device: "Other (Custom name)" → Enter "Server Manager"
   - Click "Generate"
   - Copy the 16-character password (spaces are optional)

3. Enter this App Password when prompted during setup

#### Reconfiguring Later

To change any settings later, simply run the setup wizard again:

```bash
npm run setup
```

Your project list will be preserved when reconfiguring.

### 4. Start the Server

```bash
npm start
```

The server will start on the configured port (default: 5000). Access it at:
- Local: `http://localhost:5000`
- Network: `http://YOUR_SERVER_IP:5000`

## 🔄 Auto-Start on Boot (Ubuntu/Debian)

To run Server Manager automatically on system startup and view logs in a terminal on desktop login:

### Step 1: Create a systemd service

```bash
sudo nano /etc/systemd/system/server-manager.service
```

Add this content (modify paths and username as needed):

```ini
[Unit]
Description=Server Manager
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/path/to/server-manager
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Replace:
- `YOUR_USERNAME` with your Linux username
- `/path/to/server-manager` with the full path to the project directory

### Step 2: Enable and start the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable server-manager.service
sudo systemctl start server-manager.service
```

### Step 3: Verify the service is running

```bash
sudo systemctl status server-manager.service
```

You can view logs anytime with:

```bash
journalctl -u server-manager.service -f
```

### Step 4: Auto-open terminal on desktop login (Optional)

To automatically open a terminal showing live logs when you log into the desktop:

```bash
mkdir -p ~/.config/autostart
nano ~/.config/autostart/manager-logs.desktop
```

Add this content:

```ini
[Desktop Entry]
Type=Application
Name=Server Manager Logs
Exec=gnome-terminal -- bash -c "journalctl -u server-manager.service -f; exec bash"
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
```

Now when you boot:
- The Node.js app starts automatically (even without logging in)
- If you log into the desktop, a terminal opens showing live logs
- The app runs independently of whether you're logged in

## 📖 Usage

### Adding a Project

1. Click **"Add Project"** in the navbar
2. Fill in the form:
   - **Project Name**: Display name for the project
   - **Project Path**: Absolute path to the project directory
   - **Start Command**: Command to run (e.g., `node server.js`, `python3 app.py`)
   - **Tags** (optional): Comma-separated tags for organization
   - **Auto-restart**: Start the project automatically on system boot
   - **Email on Crash**: Send email alerts when the project crashes
3. Click **"Save"**

### Managing Projects

Each project card provides these actions:

- **Start/Stop/Restart**: Control project execution
- **Update**: Run `git pull` in the project directory
- **Logs**: View real-time logs with filtering and export
- **Edit**: Modify project settings
- **Delete**: Remove the project (with confirmation)

### Project Metrics

When a project is running, you'll see:
- **CPU Usage**: Real-time CPU percentage across all processes
- **Memory Usage**: Real-time memory percentage
- **Uptime**: How long the process has been running

Use the **"Show/Hide Metrics"** button in the navbar to toggle metrics visibility for all projects. Each project card also has an individual metrics toggle.

### File Manager

Access the File Manager from the navbar to:
- Browse your entire file system
- View and edit files directly in the browser
- Upload files via drag-and-drop
- Navigate with breadcrumb navigation
- Execute commands in the current directory

### Run Command Terminal

Execute commands anywhere on your system:
- Browse directories visually
- Navigate with breadcrumb trail
- Command history with ↑↓ arrows
- Quick access to project directories
- Save successful commands as new projects

### Crash Tracking

The system automatically tracks:
- Number of crashes per project
- Last crash time and exit code
- Exit reason for failed processes

Projects with crashes display a warning alert on their card. You can dismiss alerts or view crash history.

### Tags and Filtering

Organize projects with tags:
- Add tags when creating/editing projects
- Click tags in the filter bar to filter projects
- Clear filters to show all projects

## 🔧 Configuration Files

### config.json
Stores all application settings and projects (generated by `npm run setup`):

```json
{
  "server": {
    "port": 5000,
    "host": "0.0.0.0"
  },
  "auth": {
    "passwordHash": "bcrypt_hash_here"
  },
  "email": {
    "enabled": false,
    "service": "gmail",
    "user": "your-email@gmail.com",
    "pass": "your_app_password",
    "recipient": "alerts@example.com"
  },
  "projects": [
    {
      "id": "abc123",
      "name": "My Project",
      "path": "/home/user/myproject",
      "command": "npm start",
      "tags": ["web", "production"],
      "autoRestart": true,
      "emailOnCrash": true
    }
  ]
}
```

**Note**: This file is generated by the setup wizard and contains sensitive information. It's automatically excluded from git via `.gitignore`. Never commit this file to version control.

### config.example.json
Template configuration file (committed to repository). This file shows the structure but contains no sensitive data.

## 🔒 Security Notes

- **Change the default password** immediately after first login
- Use HTTPS in production environments
- Keep the server behind a firewall
- **Don't expose to public internet** without proper authentication
- App passwords are safer than regular Gmail passwords
- Email passwords are never logged or displayed in the UI

## 🛠️ Troubleshooting

### Application won't start / "Failed to load configuration"
Run the setup wizard:
```bash
npm run setup
```

### Forgot password
Run the setup wizard again to reset your password:
```bash
npm run setup
```

### CPU/Memory not showing
Ensure the `ps` command is available:
```bash
which ps  # Should return /bin/ps or similar
```

### Email not sending
1. Run `npm run setup` and reconfigure email settings
2. Verify 2-Factor Authentication is enabled on Gmail
3. Make sure you're using an App Password, not your regular Gmail password
4. Ensure "Email on Crash" toggle is enabled for the project
5. Check server console for error messages

### Projects not auto-starting
Ensure `autoRestart` is set to `true` in project settings.

### Logs not appearing
1. Check WebSocket connection in browser console
2. Verify the project is producing output
3. Try refreshing the page
4. Check server console for WebSocket errors

### Service not starting on boot
1. Check service status: `sudo systemctl status server-manager.service`
2. View logs: `journalctl -u server-manager.service -n 50`
3. Verify paths in service file are correct
4. Ensure Node.js is installed at `/usr/bin/node` (check with `which node`)

### Port already in use
Either:
- Stop the application using that port, or
- Run `npm run setup` and change the port number

Built with:
- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [Bootstrap 5](https://getbootstrap.com/)
- [WebSocket (ws)](https://github.com/websockets/ws)
- [bcrypt](https://github.com/kelektiv/node.bcrypt.js)
- [nodemailer](https://nodemailer.com/)

---

**Note**: This project is designed for personal/internal use. Always secure your server properly and keep it behind a firewall if exposing to a network.