# BillGen — Quotation / Bill Generator

HTML, CSS, and JavaScript app for **Maa Bhawani Enterprises** style quotations, deployable on **Firebase free tier**.

## Features

- User registration (name, email, mobile, address) and login
- Quotation layout matching your document (logo, GST, CGST/SGST, bank details, declaration)
- **4-digit serial bill numbers** (0001, 0002, …) per user
- **Add unlimited line items** when creating a bill
- **Additional item price list** (editable in Settings, shown on every quotation)
- **Download PDF** with logo
- Print support

## Logo

Save your logo as:

`public/images/logo.png`

It appears on the quotation header and in downloaded PDFs.

## Firebase setup

1. Create a project at [Firebase Console](https://console.firebase.google.com/)
2. Enable **Email/Password** authentication
3. Create **Firestore** database
4. Copy web config into `public/js/firebase-config.js`
5. Update `.firebaserc` with your project ID

```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy
```

## First-time use

1. Register and login
2. Open **Settings** — verify company name, GSTIN, bank details, and catalog items
3. Add your logo at `public/images/logo.png`
4. Create a quotation from the dashboard

## Local test

```bash
npx serve public
```
