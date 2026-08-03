# Watch Together Feature Guide

## Overview
The Watch Together feature allows you to watch movies and TV shows synchronously with friends and family. One person hosts the watch party, and guests can join to watch in perfect sync with real-time chat.

## How to Use Watch Together

### Creating a Watch Party (Host)

1. **Browse to a movie or TV show** in your library
2. **Open the details screen** by tapping on the title
3. **Tap "Watch Together"** button (purple Users icon) in the action buttons row
4. **You'll be taken to the Watch Party lobby** with:
   - A unique room code to share
   - Member list showing who's joined
   - Chat for coordination

5. **Share the room code** with friends via:
   - The share button (top right)
   - Copy button next to the room code
   - Any messaging app

6. **Start watching** by tapping "Start Watching" when everyone is ready

### Joining a Watch Party (Guest)

1. **Get the room code** from the host
2. *[Note: Join flow needs to be implemented in the app UI]*
3. Once joined, you'll see:
   - The host and other members
   - Live chat
   - "Open Player" button to start watching

### During the Watch Party

**Synchronized Playback:**
- Video position automatically syncs every 2 seconds
- If your playback drifts more than 3 seconds, it auto-corrects
- Play/pause actions from the host are mirrored to all guests

**Watch Party Bar:**
- Appears at the top of the video player
- Shows sync status ("In sync" / "Syncing…" / "Buffering")
- Tap it to return to the lobby/chat

**Real-time Features:**
- Live member presence (green dot = online, orange = buffering)
- Host has a crown badge
- Real-time chat for discussing the movie/show
- All members see who's watching

### Leaving a Watch Party

**For Guests:**
- Tap the back button
- You can rejoin with the same room code

**For Host:**
- Tap the back button
- Confirm "End watch party"
- This disconnects all members and closes the room

## Technical Details

### Sync Mechanism
- **Host**: Broadcasts playback state every 2 seconds
- **Guests**: Apply host state if drift exceeds 3 seconds or after a seek
- **Latency compensation**: Guests predict host position based on network delay

### Connection Management
- All members send heartbeats every 10 seconds
- Members who haven't sent a heartbeat in 30 seconds show as "disconnected"
- Automatic reconnection when app returns to foreground

### Requirements
- All users must be **signed in** to create or join a watch party
- All users must have **the same video file** in their library
- Stable internet connection recommended for smooth sync

## Features

✅ **Implemented:**
- Real-time playback synchronization
- Host broadcast with guest auto-sync
- Live chat with typing indicators
- Member presence and status
- Room creation and joining
- Cast integration (AirPlay/Chromecast compatible)
- Background/foreground handling

🚧 **To Be Added:**
- Join room UI in main app (currently requires direct navigation)
- Public/private room settings
- Room discovery/browsing
- Invite system via notifications

## Troubleshooting

**Out of sync?**
- The app auto-corrects within 3 seconds
- Guest playback follows host automatically
- Check your internet connection

**Can't create a party?**
- Make sure you're signed in
- Verify the video has a local file

**Buffering issues?**
- Appears as orange dot next to your name
- Host should pause until everyone is ready
- Consider reducing video quality if available

## Architecture

The watch party system consists of:

1. **WatchPartyContext** (`src/context/WatchPartyContext.tsx`)
   - Central state management
   - Real-time listeners for room, members, and messages
   - Sync logic for host broadcast and guest following

2. **WatchPartyService** (`src/services/watchPartyService.ts`)
   - Firebase Firestore integration
   - Room CRUD operations
   - Real-time subscriptions

3. **WatchPartyScreen** (`src/screens/WatchPartyScreen.tsx`)
   - Lobby interface
   - Member list and chat UI
   - Room code sharing

4. **VideoPlayerScreen** (`src/screens/VideoPlayerScreen.tsx`)
   - Registers player bridge for remote control
   - Notifies context of playback changes
   - Shows WatchPartyBar when active

5. **DetailsScreen** (`src/screens/DetailsScreen.tsx`)
   - Entry point with "Watch Together" button
   - Creates new rooms and navigates to lobby

---

*Built with React Native, Expo, and Firebase Firestore*
