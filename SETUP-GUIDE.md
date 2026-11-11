# Setup guide

Publish the app on **GitHub**, keep all records in **your own Google Sheet (Excel)**, protect it with **your user name + password**, and install it on **Android (APK)** and **Windows (installer)**.

```
 Website (GitHub Pages)  ┐
 Android app (APK)       ├──►  Web app URL  ──►  Google Sheet (Excel) + Drive folder + Gmail reminders
 Windows app (installer) ┘     (asks for your user name + password)
```

All three apps are the **same program** and use the **same Google Sheet**, so what you enter on the phone shows on the PC.

**You need:** a Google account (Gmail) and a GitHub account. No server, no credit card, no Google Cloud API key.

> **About “the API”:** you do **not** need an API key. Google Apps Script gives you a **Web app URL** (it ends with `/exec`). That URL *is* the API of this app. It only answers after the correct user name and password, which you store in your own Google account.

Do the steps in this order: **1 → 2 → 3** (Google), then **4 → 5** (GitHub), then **6 → 7** (install).

---

## Step 1 – Create the Excel (Google) sheet

1. Open <https://drive.google.com> (signed in with your Gmail).
2. **New → File upload** → choose `sample/Medicine-Monitor-Template.xlsx` from this project.
   *(Want to see example rows first? Use `Medicine-Monitor-Sample-Data.xlsx` instead; delete the example rows later.)*
3. Right-click the uploaded file → **Open with → Google Sheets**.
4. In the Google Sheet: **File → Save as Google Sheets** (so it is a real Google Sheet, not an Excel file).
5. Rename it, e.g. **Medicine Monitor**. You should see the tabs `READ ME`, `Medicines`, `DoseLog`, `Periods`, `Files`.

> Don't want to upload the file? Create a blank Google Sheet instead – the script in Step 2 creates the tabs by itself.

## Step 2 – Add the back-end script and your login

1. In your Google Sheet: **Extensions → Apps Script**. A new tab opens.
2. Delete the sample code in `Code.gs`. Open `backend/Code.gs` from this project, copy **everything**, paste it. Click **Save** (disk icon).
3. Set the time zone: click the **gear icon (Project Settings)** → tick **Show “appsscript.json” manifest file in editor** → go back to **Editor** → open `appsscript.json` → replace its content with `backend/appsscript.json` → Save.
   *(It sets the time zone to `Asia/Kolkata`. Change it if you live elsewhere – reminders use it.)*
4. **Set your user name and password** (this is the login for the app):
   - Gear icon (**Project Settings**) → scroll down to **Script properties** → **Edit script properties** → **Add script property** twice:

     | Property | Value |
     |---|---|
     | `APP_USER` | your user name, e.g. `harish` |
     | `APP_PASSWORD` | a long password only you know |

   - **Save script properties.**
   - These stay in your Google account. They are **not** in the code, so publishing the code on GitHub does not reveal them.
5. Back in the **Editor**, choose the function **`setup`** in the drop-down at the top → click **Run**.
6. Google asks for permission (**Review permissions**): choose your account. If it says *“Google hasn't verified this app”* → **Advanced → Go to … (unsafe) → Allow**. This is your own script; it needs Sheets (to save), Gmail (to send your reminders), Drive (to store report files) and triggers (to run reminders).
7. The log says **Execution completed**. You also get a “Medicine Monitor is ready” e-mail. `setup` created the tabs, the Drive folder **Medicine Monitor Reports** and the reminder schedule.
   *(If it ends with an error about `APP_USER`, add the two properties from item 4 and run `setup` again.)*

## Step 3 – Deploy it and copy the Web app URL (“the API”)

1. Top right: **Deploy → New deployment**.
2. Click the **gear icon** next to *Select type* → **Web app**.
3. Fill in:
   - **Description:** `Medicine Monitor`
   - **Execute as:** **Me** (your Gmail)
   - **Who has access:** **Anyone**   ← needed so the website, phone and PC can reach it. The login protects your data.
4. **Deploy** → allow access if asked.
5. Copy the **Web app URL**. It looks like  
   `https://script.google.com/macros/s/AKfycb…long…/exec`
6. Test: paste that URL into a browser tab. You should see: *“Medicine & Period Monitor backend is running.”*

> **Keep the same URL when you change `Code.gs` later:** **Deploy → Manage deployments → ✏ (edit) → Version: New version → Deploy.** (Choosing “New deployment” again gives a different URL.)

## Step 4 – Put the URL in `config.js`

Open `config.js` in this project and paste your URL:

```js
window.MEDMON_CONFIG = {
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycb…/exec'
};
```

This file is safe to publish: the URL alone gives **no** access without your user name and password.

## Step 5 – Publish on GitHub (GitHub Pages)

### 5a. Create the repository
1. Sign in to <https://github.com> → **+ (top right) → New repository**.
2. Name: `medicine-monitor` (any name). **Public**. Tick *Add a README* **off**. **Create repository.**
   *(Public is fine: the repository contains no passwords and none of your records.)*

### 5b. Upload the files — pick ONE way

**Way 1 – in the browser (easiest):**
1. On the new empty repo page click **uploading an existing file**.
2. Drag **everything inside** the project folder into the page: `index.html`, `style.css`, `app.js`, `config.js`, `sw.js`, `manifest.webmanifest`, `README.md`, `SETUP-GUIDE.md`, `.gitignore`, and the folders `icons`, `backend`, `sample`, `installers`, `.github`.
3. **Commit changes.**

> The browser upload sometimes skips hidden folders like `.github`. If `.github/workflows/build-apps.yml` is missing in your repo: **Add file → Create new file**, type `.github/workflows/build-apps.yml` as the name, paste the file's content, **Commit**. (Needed only for Step 7.)

**Way 2 – with Git (PowerShell, inside the project folder):**
```bash
git init
git add .
git commit -m "Medicine Monitor"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/medicine-monitor.git
git push -u origin main
```

### 5c. Turn on the website
1. Repo → **Settings → Pages**.
2. **Source:** *Deploy from a branch* → **Branch:** `main` / folder `/ (root)` → **Save**.
3. Wait 1–2 minutes. The page shows your address:  
   **`https://YOUR-USERNAME.github.io/medicine-monitor/`**

> Forgot to paste the URL into `config.js` first? On GitHub open `config.js` → pencil icon ✏ → paste the URL → **Commit changes** → wait a minute → refresh the site with **Ctrl+F5**.

## Step 6 – Sign in and install as an app (no APK needed)

1. Open `https://YOUR-USERNAME.github.io/medicine-monitor/` – you see the **sign-in** screen. Enter the `APP_USER` / `APP_PASSWORD` from Step 2.
2. **Android (Chrome):** menu ⋮ → **Install app** (or *Add to Home screen*).
3. **Windows (Edge or Chrome):** click the install icon in the address bar → **Install**.
4. On the first sign-in the app loads your sheet. Add your medicines on the **Medicines** tab.

You stay signed in on a device for 30 days. **Settings → Sign out** removes the records from that device (they stay in your sheet).

## Step 7 – Android APK and Windows installer (built by GitHub)

You do not need Android Studio or anything on your PC; GitHub builds both files for you.

1. Repo → **Actions** tab → (first time) click **“I understand my workflows, go ahead and enable them”**.
2. Left side: **Build apps** → **Run workflow** → **Run workflow**.
3. Wait about 10–15 minutes until both jobs show a green ✔. Click the finished run.
4. At the bottom, under **Artifacts**, download:
   - **MedicineMonitor-Android-APK** → contains `MedicineMonitor.apk`
   - **MedicineMonitor-Windows-Installer** → contains `MedicineMonitor-Setup.exe`
   *(Tip: push a tag like `v1.0.0` and the same files also appear under **Releases**.)*

### Install on Android
1. Copy `MedicineMonitor.apk` to the phone (WhatsApp to yourself, Drive, USB …) and tap it.
2. Allow **Install unknown apps** for the app you opened it from. If Play Protect warns about an unknown developer → **Install anyway** (it is your own app).
3. Open **Medicine Monitor** → sign in → **Allow notifications**.
4. For reminders that ring on time even when the app is closed:
   **Settings → Apps → Medicine Monitor → Alarms & reminders → Allow**, and **Battery → Unrestricted**. Then open the app's **Settings** tab → **Turn on pop-up reminders** (it schedules the next 14 days of doses).
5. Updating later: Android only installs a new APK over an old one if both were signed with the same key, and each GitHub build makes a new test key. So **uninstall the old app first**, then install the new one. Your records are safe in the Google Sheet.

### Install on Windows
1. Run `MedicineMonitor-Setup.exe`. Windows SmartScreen says *“Windows protected your PC”* because the installer is not code-signed → **More info → Run anyway**.
2. Choose the folder → **Install**. A desktop shortcut **Medicine Monitor** is created.
3. Closing the window keeps the app in the **system tray** so reminders still pop up. Right-click the tray icon for **Start with Windows** or **Quit**.

---

## Daily use and managing everything

| I want to… | Do this |
|---|---|
| See my data in Excel | Open the Google Sheet → **File → Download → Microsoft Excel (.xlsx)** |
| Report as Excel / PDF | App → **Reports** → *Download Excel (CSV)* or *Print / Save PDF* |
| Change my password | Apps Script → Project Settings → Script properties → edit `APP_PASSWORD`, then run **`signOutEverywhere`** (signs out all phones / PCs) |
| Lost my phone | Same as above: change `APP_PASSWORD`, run `signOutEverywhere` |
| Wrong password too often (blocked) | Wait 15 minutes, or run **`unlockLogin`** in Apps Script |
| Get reminder mails in a different Gmail | App → **Settings → Mail** → type the address → *Save & send test mail* |
| Stop the “missed tablet” or “take now” mails | App → **Settings → Mail** → untick the box → *Save* |
| Give another person (e.g. Nithya) her own login | See **Logins for other people** below |
| Remove a person's login | Delete their row in the **Users** tab – they are signed out at once |
| Change another person's password | Type the new password in the `password` column of their row in the **Users** tab |
| Put the app link in the reminder mails | In `Code.gs` set `APP_URL` to your GitHub Pages address → new version |
| Update the app | Change files on GitHub → website updates in ~1 minute. Run **Build apps** again for new APK / installer. |

## Logins for other people

Your own login (`APP_USER` / `APP_PASSWORD`) is the **owner**: it shows every person's records.
Anyone you add in the **Users** tab of the Google Sheet gets a login that shows **only their own records** – this is checked in Google's server, so it cannot be bypassed from the web page.

1. Paste the latest `backend/Code.gs` into Apps Script, **Save**, then **Deploy → Manage deployments → Edit → New version → Deploy**.
2. Run **`setup`** once more. It adds a **Users** tab to the Sheet.
3. In the **Users** tab fill one row per person:

   | user | person | email | password | passHash |
   |---|---|---|---|---|
   | nithya | Nithya | nithya@gmail.com | *(a password)* | *(leave empty)* |

   - `user` = what she types to sign in. `person` = the name her medicines and periods are saved under – it must match the **Person** name already used in the app for her old records.
   - `email` = where her reminder and missed-tablet mails go (she can change it in **Settings → Mail**).
4. Run **`saveUsers`** in Apps Script. The password disappears from the sheet and only a scrambled value stays in `passHash`. (It also happens by itself the next time anybody signs in.)

**Mails:** each person gets a mail at each tablet time and a “You missed your medicine” mail when a tablet is still not marked 3 hours after its time. The owner gets a copy of every person's mail.

**Files:** a report file opens on the device that uploaded it. On another device it opens through Google Drive, which only works when signed in to the Google account that owns the Sheet.

## If something goes wrong

| Message | Cause / fix |
|---|---|
| *Unexpected reply – deploy the web app with access “Anyone”* | Deployment access is not **Anyone**, or the URL is wrong. Redo Step 3. |
| *Cannot reach Google (offline, or wrong URL)* | No internet, or `WEB_APP_URL` in `config.js` is wrong. |
| *Login is not set up yet …* | Add `APP_USER` and `APP_PASSWORD` (Step 2, item 4). |
| *Wrong user name or password* | User name is not case-sensitive; the password is. |
| *Too many wrong attempts* | Wait 15 minutes or run `unlockLogin`. |
| *Your session ended* | Sign in again (sessions last 30 days). |
| Website shows an old version | Press **Ctrl+F5**. If you installed it as an app, close and reopen it once. |
| I changed `Code.gs` but nothing changed | You must publish **a new version** of the deployment (Step 3 tip). |
| No reminder e-mails | Run `setup` again (it recreates the schedule) and check Apps Script → **Triggers** (clock icon). |
| The build failed in Actions | Open the failed run, copy the red error lines and send them to me – first runs sometimes need a small fix. |

## Security – what is and is not protected

- **Protected:** your records. They sit in your Google Sheet and are only returned after a correct sign-in (checked in Google's server, not in the web page). Wrong guesses are slowed down and blocked after 5 tries per user name.
- **Separated:** a login from the **Users** tab can read, change and delete only its own person's rows. Their passwords are stored as salted hashes, never as readable text.
- **Cleaned:** everything saved to the Sheet is stored as plain text (no formulas), and the web page only loads its own scripts.
- **Public on purpose:** the app's code, `config.js` and the Web app URL. They contain no secrets.
- **Never** put your password into any file you upload to GitHub. It belongs only in *Script properties*.
- Keep the Google Sheet and the Drive folder **private** (not shared with anyone).
- Use a long password. Anyone who knows it can read your records.
