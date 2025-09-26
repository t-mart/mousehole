# Manual Unraid Template Installation

A guide for manually adding custom Docker application templates to your Unraid server.

## Overview

This guide covers the manual process of installing XML templates for Docker containers in Unraid. Templates define container configuration including ports, volumes, environment variables, and other Docker settings.

## Prerequisites

- Unraid server with Docker enabled
- SSH or terminal access to your Unraid server
- Basic understanding of Docker containers and XML

## Installation Process

### Step 1: Access the Templates Directory

Templates are stored in the following directory:
```
/boot/config/plugins/dockerMan/templates-user/
```

Navigate to this directory via SSH or the Unraid terminal:
```bash
cd /boot/config/plugins/dockerMan/templates-user/
```

### Step 2: Download or Create Template File

#### Option A: Download from Repository
```bash
wget https://raw.githubusercontent.com/username/repository/main/template-name.xml
```

#### Option B: Create Template Manually
Create a new XML file with a descriptive name:
```bash
nano my-mousehole.xml
```
Copy the XML template data from the provided file and paste it (right click - paste)
Ctrl + x
Y - yes
Enter

### Step 3: Add Contianer
Go to the docker page and click Add Contianer. This will bring up a new container window, select the mousehole templete form the template drop down.
Verify all seeting are correct for your set up
Click Apply

