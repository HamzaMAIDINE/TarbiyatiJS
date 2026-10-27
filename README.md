# Tarbiyati

An Arabic web app for studying education sciences, with lessons, quizzes, past exams, and saved progress.

## Install and run

Requires Git and **Node.js 22.23.4** (see [`.nvmrc`](.nvmrc)), with npm.

1. Clone the repository and install dependencies:

   ```sh
   git clone https://github.com/HamzaMAIDINE/TarbiyatiJS.git
   cd TarbiyatiJS
   npm ci
   ```

2. Create your local configuration:

   ```sh
   cp .env.example .env
   ```

   Keep the default settings for local development. SQLite is created automatically; no database setup is required.

3. Start the app:

   ```sh
   npm start
   ```

4. Open **http://localhost:3000**, create an account, and enter the verification code. With email settings left blank, find the code in the newest `.data/mail/*.txt` file. After verification, open a lesson, quiz, or past exam; your progress is saved automatically.

Copy the original reference PDFs into `PDFs/` with their original filenames to enable downloads. These files are not included on GitHub.

## Public hosting

In `.env`, set `NODE_ENV=production`, `PUBLIC_ORIGIN=https://your-domain`, and configure Brevo HTTPS or authenticated SMTP using [`.env.example`](.env.example). Run the app behind an HTTPS reverse proxy.

For admin access, set `ADMIN_EMAIL` to your email address and verify that account. Keep `.env` and `.data/` private and out of Git.
