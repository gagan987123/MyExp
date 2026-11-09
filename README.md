<p align="center">
  <img src="assets/images/icon.png" width="120" alt="MyExp app icon" />
</p>

<h1 align="center">MyExp</h1>

<p align="center">
  A local-first expense tracker for iOS and Android.<br />
  No account. No backend. Your data stays on your device.
</p>

---

MyExp is a personal finance app built with Expo and React Native. It tracks expenses and income, handles recurring bills and installments, splits trip costs between friends, keeps a ledger of money lent and borrowed, and exports clean PDF statements.

The app is designed offline-first: every entry lives in a local SQLite database. There is no sign-up, no cloud sync, and no server-side account. Optional AI-assisted entry is available but disabled by default.

## Features

- **Expenses and income** — log either direction, edit or delete entries, and attach notes and dates.
- **Custom categories** — use the built-in categories or create your own with an icon.
- **Recurring entries** — schedule monthly expenses and income, with optional installment limits.
- **Monthly insights** — see spending and income trends in charts.
- **Trips and splitting** — add members, record who paid, split equally or with custom amounts, track settlements, and calculate who owes whom.
- **Loans and receivables** — track money lent and borrowed, record partial payments, and see outstanding balances.
- **PDF statements** — export a date-ranged report with your transactions and totals.
- **iOS integrations** — Siri shortcuts, share-sheet intake, a home-screen widget, and deep links for quick entry.
- **Debt reminders** — local notifications for outstanding receivables.
- **Optional AI parsing** — use an OpenRouter key to interpret natural-language entries. Off unless you enable it.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Expo SDK 57, React Native 0.86, React 19 |
| Navigation | Expo Router (typed routes) |
| Language | TypeScript |
| Database | `expo-sqlite` with versioned migrations |
| Styling | NativeWind + Tailwind CSS 4 |
| Fonts | Space Grotesk |
| Charts | `react-native-gifted-charts` |
| Export | `expo-print` + `expo-sharing` |
| Security | `expo-secure-store` for the optional API key |

## Architecture

The codebase follows a strict one-way flow:

```text
Screen (app/) → Service (lib/services) → Repository (lib/repositories) → SQLite (lib/db)
```

- Screens handle UI and navigation only.
- Services own business rules: validation, splits, balances, recurring posting, and stats.
- Repositories contain the SQL and row mapping.
- `lib/db` manages the database connection and migrations.
- `lib/service.ts` is the public domain API imported by screens.

This keeps money logic testable and out of components, and makes schema changes explicit.

## iOS native integrations

The native extensions are generated through Expo config plugins in `plugins/` and custom Expo modules in `modules/`.

| Feature | What it does | Requirement |
| --- | --- | --- |
| Siri / App Intents | “Log expense in MyExp” and “Add expense in MyExp” | Dev build |
| Share extension | Send text to MyExp from another app | Dev build |
| Widget | Home-screen summary that reloads after changes | Dev build |
| Debt reminders | Local 9 AM notifications for receivables | Dev build |
| Deep links | Open the add-expense screen with prefilled values | Any build |

Example deep link:

```text
expensetracker://add-expense?amount=100&category=petrol&note=chai&save=1
```

All extensions read and write through the App Group database configured in `config/config.js`. Native iOS features require a signed development build — they do **not** work in Expo Go.

## Getting started

### Prerequisites

- Node.js 20 or newer
- Xcode and CocoaPods for iOS
- Android Studio and an emulator or device for Android

### Install and run

```bash
npm install

# iOS development build (required for native features)
npm run ios

# Android development build
npm run android
```

`npm start` launches the Metro dev server. If you only want the JavaScript app without the native extensions, you can use Expo Go, but the Siri, widget, share-sheet, and reminder features will be unavailable.

### Configuration

`config/config.js` is the single source of truth for app identity, bundle identifiers, the App Group, database name/version, widget and share targets, and the optional AI endpoint. It is imported by `app.config.js`, the config plugins, and app code.

To build under your own Apple developer account, change `bundleId` and the derived App Group in that file, then re-run prebuild. The iOS deployment target is 18.0.

## Optional AI setup

AI entry is opt-in and disabled by default.

1. Open **Settings → AI**.
2. Paste an [OpenRouter](https://openrouter.ai/) API key.
3. Enable the feature.

The key is stored in the iOS keychain via `expo-secure-store` and mirrored into the shared App Group database so the Siri intent can use it. Disable AI at any time in Settings; the app then falls back to local keyword rules. When enabled, the text you submit for parsing is sent to OpenRouter.

## Project structure

```text
app/                  Expo Router screens
  (tabs)/             Home, add, expenses, trips, loans, settings
  expense/            Entry and category detail screens
  trip/               Trip detail and add-expense screens
components/           Shared UI
config/               Shared app/native/AI configuration
lib/
  ai/                 Optional OpenRouter client
  core/               Dates, IDs, validation, errors
  db/                 SQLite connection and migrations
  export/             PDF report generation
  notifications/      Debt reminder scheduling
  repositories/       SQL and row mapping
  services/           Business logic
modules/              Local Expo native modules
plugins/              Config plugins and native source templates
```

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` | Build and run the iOS app |
| `npm run android` | Build and run the Android app |
| `npm run web` | Start the web target |
| `npm run lint` | Run ESLint |

## Data and privacy

- All financial data is stored locally in SQLite (`expenses.db`).
- There is no backend, no account, and no analytics.
- Exports are generated on-device and shared through the system share sheet.
- The optional AI key is kept in the keychain; AI requests happen only when you enable the feature and submit text.
- The widget, share extension, and Siri intent access the same local database through the App Group.

Because data is device-local, uninstalling the app removes it. There is currently no built-in backup or multi-device sync.

## Limitations

- Native integrations are iOS-only; the Android app supports the core tracking features.
- Amounts are formatted for INR (`en-IN`).
- No cloud sync, user accounts, or automatic backups.
- Siri, widget, share extension, and reminders require a signed development build.

## Status

Personal project, actively evolving. Built for daily use as a fast, private expense log.
