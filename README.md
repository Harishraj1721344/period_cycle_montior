# Medicine & Period Monitor

Tablet / tonic reminders, period tracker and reports. One app for **website**, **Android (APK)** and **Windows (installer)** – all saving to **one Google Sheet (Excel)** that only you can open, with **user name + password** sign-in.

➡ **Start here: [SETUP-GUIDE.md](SETUP-GUIDE.md)** (GitHub, Google Sheet, Web app URL, sign-in, APK, Windows installer – every step).

## What it does

| | |
|---|---|
| **Tablet & tonic monitor** | Add a medicine with a start date, number of days and timings: *5 days morning & night*, *tonic every day at 9:00*, … The **Today** tab shows each dose with **Taken / Skip**; unmarked doses become **Missed**. |
| **Repeat patterns** | Every day · every N days · chosen weekdays · monthly on a date · **monthly on the Nth weekday (e.g. Vitamin D on the 2nd Sunday)**. |
| **Period monitor** | Calendar, average cycle, next expected date. |
| **Reports** | Taken / missed / skipped and % per medicine. Download **Excel (CSV)** or **Print / Save PDF**. |
| **Report files** | Upload lab reports, prescriptions, scans as **image or PDF** → saved in your Google Drive, listed in the sheet. |
| **Back side = Excel sheet** | Google Sheet tabs `Medicines`, `DoseLog`, `Periods`, `Files`. Download any time as `.xlsx`. |
| **Reminders** | Pop-up + sound while the app is open · real phone notifications in the Android app · Gmail reminders (7 AM plan, “take now” at each dose time, weekly report). |
| **Sign-in** | User name + password checked by your own Google Apps Script. Sessions last 30 days; 5 wrong tries block sign-in for 15 minutes. |

## Ways to use it (same data everywhere)

1. **Website** – publish on GitHub Pages; “Install app” in Chrome / Edge makes it a phone / PC app.
2. **Android APK** – built for you by GitHub Actions (no Android Studio).
3. **Windows installer** – built for you by GitHub Actions; lives in the system tray so reminders keep working.

## Files

```
index.html  style.css  app.js     the app (website + inside the APK / installer)
config.js                         paste your Web app URL here (once)
manifest.webmanifest  sw.js       make the website installable / work offline
icons/                            app icons
backend/Code.gs                   Google Apps Script: login + Google Sheet + Drive + Gmail
backend/appsscript.json           time zone / web app settings
sample/                           Medicine-Monitor-Template.xlsx (empty) and -Sample-Data.xlsx (examples)
installers/windows, /android      small wrappers used to build the .exe and .apk
.github/workflows/build-apps.yml  the button that builds the .apk and .exe
SETUP-GUIDE.md                    full step-by-step guide
```

## Try it quickly (no Google, no login)

Leave `WEB_APP_URL` empty in `config.js` and open `index.html` – the app then works on that one device only. In **Settings → Add sample data** to see it filled.

## Notes

- This app helps you remember and keep records. It does not replace a doctor's advice.
- The Android build is a personal “debug” build (not for the Play Store). In the Android app, saving CSV files may not work – use the website or Windows app for exports.
