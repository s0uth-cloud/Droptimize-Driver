# Droptimize 🚚

**A complete courier management system** for admins to track deliveries and drivers, and for drivers to find optimal delivery routes.

## What is Droptimize?

Droptimize consists of two parts:

- **📱 Mobile App** - For drivers to view assigned parcels and find the best routes
- **🖥️ Web Dashboard** - For admins to manage drivers, track deliveries, and monitor performance

Both the web and mobile apps are fully integrated and work together seamlessly.

---

## 🚀 Getting Started

**→ [👉 GO TO INSTALLATION GUIDE](INSTALLATION.md) ←**

The installation guide covers:

- ✅ Quick setup for casual users
- ✅ Full development setup for programmers
- ✅ Step-by-step instructions for mobile and web
- ✅ Troubleshooting tips

---

## Project Structure

```
Droptimize/
├── app/                    # Mobile app screens (React Native)
├── components/             # Mobile UI components
├── services/              # Firebase & API integrations
├── firebaseConfig.js      # Firebase configuration
├── app.config.js          # Expo configuration
└── INSTALLATION.md        # Installation guide (START HERE!)

Droptimize-Web/
├── src/
│   ├── components/        # Web UI components (React)
│   ├── pages/            # Web app pages
│   ├── services.js       # API and Firebase services
│   └── firebaseConfig.js # Firebase configuration
├── functions/            # Cloud Functions (if needed)
└── public/              # Static assets
```

---

## Technology Stack

| Platform    | Technology                   | Version  |
| ----------- | ---------------------------- | -------- |
| **Mobile**  | React Native (Expo)          | SDK 54   |
| **Web**     | React + Vite                 | React 19 |
| **Backend** | Firebase                     | Latest   |
| **Maps**    | Google Maps API              | Latest   |
| **State**   | Firebase Auth + AsyncStorage | -        |

---

## Features

### For Drivers 📦

- View assigned parcels for today
- Optimize delivery routes with Google Maps
- Real-time location tracking
- Mark parcels as delivered with photos
- Receive notifications about new deliveries

### For Admins 🎯

- Dashboard with KPIs (delivery volume, driver status)
- Manage all drivers and parcels
- Monitor driver performance and speeds
- Track overspeeding incidents
- Real-time map view of all drivers
- Assign parcels to drivers

---

## Development

### Quick Commands

```bash
# Start development server
npm start

# Run on Android
npm run android

# Run on Web
npm run web

# Check code quality
npm lint

# Build for production (web)
npm run build
```

### Architecture

- **Mobile App**: Expo Router for navigation, Firebase Auth for login, Async Storage for local caching
- **Web Dashboard**: React Router for navigation, Firebase Realtime Database for data sync
- **Real-time Updates**: Firebase listeners for live driver location and delivery status
- **Maps Integration**: Google Maps SDK on mobile, @react-google-maps on web

---

## Database Schema

The app uses Firebase Realtime Database with the following main collections:

- **users/** - User accounts with authentication
- **drivers/** - Driver profiles and current status
- **parcels/** - Parcel delivery information
- **incidents/** - Safety incidents (overspeeding, collisions)

---

## Firebase Configuration

The app requires a Firebase project configured with:

- ✅ Email/Password Authentication
- ✅ Realtime Database
- ✅ Storage (for profile pictures)
- ✅ Cloud Functions (optional, for advanced features)

Environment variables are stored in `.env` files (not committed to git).

---

## API Integrations

- **Google Maps API** - Route optimization and navigation
- **Google Places API** - Address autocomplete
- **Firebase Authentication** - User login/signup
- **Firebase Realtime Database** - Data synchronization

---

## Performance Notes

- Mobile app uses location filtering to reduce battery drain
- Web dashboard renders charts using MUI X Charts
- Both platforms cache data locally to minimize API calls

---

## Known Limitations

- iOS build requires Apple Developer account (not in this repo yet)
- Password reset emails use Firebase's default reset page
- Map clustering on web requires marker clusterer package

---

## Security Considerations

- All API keys are environment variables (not hardcoded)
- Firebase security rules enforce role-based access
- Sensitive user data is encrypted in transit
- Mobile app uses secure token storage

---

## Troubleshooting

**For setup issues**, see [INSTALLATION.md](INSTALLATION.md#troubleshooting)

**For development questions**, check:

- [Expo Documentation](https://docs.expo.dev/)
- [Firebase Documentation](https://firebase.google.com/docs)
- [React Documentation](https://react.dev)

---

## Contributing

To contribute code:

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and test locally
3. Commit with clear messages: `git commit -m "Add feature X"`
4. Push and open a Pull Request

---

## License

This project is proprietary software.

---

## Support

For issues or questions:

1. Check [INSTALLATION.md](INSTALLATION.md)
2. Contact your admin or project lead
3. Check the project's issue tracker

---

**Ready to get started?** → [📖 Go to Installation Guide](INSTALLATION.md)
