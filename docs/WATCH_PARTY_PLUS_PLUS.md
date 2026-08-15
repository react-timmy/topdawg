# Watch Party++ Enhancement

## Overview

Watch Party++ is an enhanced version of the basic watch party feature with persistent rooms, advanced voting system, and improved social features.

## Key Features

### 1. **Party Hub Tab** 
- New dedicated "Party" tab in main navigation (replaced floating button)
- View all active parties you're in
- Create new party rooms
- Join existing parties via room code
- See party status at a glance (host badge, live indicator, member count)

### 2. **Enhanced Room Capacity**
- Increased from 8 to **15 members** per party
- Only creator can invite members
- Room codes for easy joining

### 3. **Persistent Watch Parties**
- Chat history preserved throughout session
- Parties persist with automatic timeout rules:
  - **10 minutes** of inactivity → party expires
  - Host disconnect → **5 minute** grace period before disbanding
  - If host reconnects within grace period, party continues

### 4. **Voting System** (Two Modes)

#### Simple Mode
- Host posts a movie/TV show from their library
- Members vote on whether to watch it
- Poll has a configurable duration
- Members can cancel and revote anytime before poll closes

#### Contribution Mode
- Host initiates poll
- First 5 members submit movies/TV shows from their libraries
- Once 5 submissions received, voting opens
- All members (including submitters) vote on the options
- Winner determined when poll duration expires

### 5. **Host Controls**
- Only host controls playback (pause/play/seek)
- Host disconnect handling with grace period
- Party automatically ends if host doesn't reconnect within 5 minutes

## Technical Implementation

### New/Modified Files

1. **src/screens/PartyHubScreen.tsx** ⭐ NEW
   - Main hub for watch party management
   - Lists active parties
   - Create/join party buttons
   - Requires authentication

2. **src/screens/CreatePartyScreen.tsx** ⭐ NEW
   - Form to create new party
   - Select content from library
   - Optional room name
   - Navigate directly to party after creation

3. **src/types.ts** ✏️ MODIFIED
   - Added `Party` to TabParamList
   - Added `CreateParty` to RootStackParamList
   - Extended `WatchPartyRoom` with new fields:
     - `roomName?: string`
     - `activePoll?: WatchPartyPoll | null`
     - `lastActivityAt: string`
     - `hostConnected: boolean`
     - `hostDisconnectedAt?: string | null`
   - Added new types:
     - `PollMode` - 'simple' | 'contribution'
     - `PollSubmission` - submission in contribution mode
     - `PollVote` - vote on a poll option
     - `WatchPartyPoll` - complete poll structure

4. **src/services/watchPartyService.ts** ✏️ MODIFIED
   - Updated `MAX_MEMBERS` to 15
   - Added timeout constants:
     - `INACTIVITY_TIMEOUT_MS` (10 min)
     - `HOST_DISCONNECT_GRACE_MS` (5 min)
   - Added `roomName` parameter to `createRoom()`
   - Added new methods in `watchPartyExtensions`:
     - `getUserActiveRooms()` - fetch user's active parties
     - `updateActivity()` - track room activity
     - `updateHostConnection()` - track host status
     - `shouldDisbandRoom()` - check timeout conditions

5. **src/navigation/TabNavigator.tsx** ✏️ MODIFIED
   - Added `Users` icon import
   - Added `PartyHubScreen` import
   - Added Party tab to TAB_CONFIG
   - Added Party tab screen

6. **src/navigation/RootNavigator.tsx** ✏️ MODIFIED
   - Added `CreatePartyScreen` import
   - Added CreateParty route

## Data Structure

### WatchPartyRoom (Extended)
```typescript
{
  roomId: string;
  hostUid: string;
  hostDisplayName: string;
  status: 'lobby' | 'countdown' | 'playing' | 'paused' | 'ended';
  item: MediaItem;
  activeFileUri?: string | null;
  playback: WatchPartyPlaybackState;
  createdAt: string;
  expiresAt: string;
  memberCount: number;
  countdownStartedAt?: string;
  roomName?: string;                    // ⭐ NEW
  activePoll?: WatchPartyPoll | null;   // ⭐ NEW
  lastActivityAt: string;               // ⭐ NEW
  hostConnected: boolean;               // ⭐ NEW
  hostDisconnectedAt?: string | null;   // ⭐ NEW
}
```

### WatchPartyPoll
```typescript
{
  id: string;
  mode: 'simple' | 'contribution';
  hostItem?: MediaItem | null;
  submissions: PollSubmission[];
  votes: PollVote[];
  createdAt: string;
  expiresAt: string;
  status: 'accepting_submissions' | 'voting' | 'closed';
  winner?: MediaItem | null;
}
```

## Navigation Flow

```
Party Tab (PartyHubScreen)
├── Create Party Button → CreatePartyScreen
│   ├── Enter room name (optional)
│   ├── Select content from library
│   └── Create → Navigate to WatchPartyScreen
│
├── Join Party Button → JoinWatchPartyScreen
│   └── Enter room code → Navigate to WatchPartyScreen
│
└── Active Party Card → WatchPartyScreen
    ├── View members
    ├── Chat
    ├── Vote (if poll active)
    └── Start watching (host only)
```

## Timeout Behavior

### Inactivity Timeout (10 minutes)
- Tracks `lastActivityAt` timestamp
- Updated on: messages, playback changes, member joins
- If no activity for 10 minutes → party automatically ends

### Host Disconnect Grace Period (5 minutes)
- When host loses connection, `hostConnected` = false
- `hostDisconnectedAt` timestamp recorded
- Guests wait up to 5 minutes for host to reconnect
- If host reconnects → `hostConnected` = true, grace period cleared
- If 5 minutes elapsed → party automatically disbands

## Future Enhancements (Not Yet Implemented)

### ~~Poll System Implementation~~ ✅ **COMPLETED** - See POLL_IMPLEMENTATION.md

~~The poll types are defined but the following needs to be built:~~

**Status: ✅ Fully Implemented**

All poll system features have been implemented:
- ✅ Poll Creation UI (Simple & Contribution modes)
- ✅ Poll Service Methods (create, submit, vote, close, cancel)
- ✅ Poll Display Component (all states: submissions, voting, closed)
- ✅ Integration into WatchPartyScreen
- ✅ Real-time countdown timer
- ✅ Auto-close on expiry
- ✅ Vote counting and winner determination

See `POLL_IMPLEMENTATION.md` for complete implementation details.

### ~~Friend System Integration~~ ✅ **COMPLETED**

~~Currently uses room codes only~~  
~~Future: Browse friend list and send direct invites~~  
~~Friend presence indicators~~  
~~Friend-only vs public parties~~

**Status: ✅ Fully Implemented**

All friend system features have been implemented:
- ✅ Friend list management (add, remove, search)
- ✅ Friend requests (send, accept, decline)
- ✅ Direct party invitations to friends
- ✅ Online status indicators (green badge)
- ✅ Privacy settings (Public / Friends Only parties)
- ✅ Real-time updates for friends and requests
- ✅ Friends tab in navigation
- ✅ Party invitation cards in Party Hub

See Friend System section below for complete implementation details.

### Notification System
- Push notifications when:
  - Friend sends you a request
  - Friend accepts your request
  - Friend invites you to party
  - Poll is about to close
  - Winner announced
  - Party is starting soon
  - Host reconnected

---

## Friend System Implementation ✅

The friend system enables users to connect with other users, manage friendships, and send direct party invitations with privacy controls.

### Features

1. **Friend Management**
   - Add friends by searching display names
   - Accept/decline friend requests
   - Remove friends with confirmation
   - View friends list with online status indicators
   - Real-time updates for friend requests and status
   - Bidirectional friend relationships

2. **Party Invitations**
   - Invite specific friends when creating a party
   - Privacy settings: Public (anyone with code) or Friends Only
   - Friend selector with multi-select chips
   - Party invitations appear in Party Hub with badge
   - Accept/decline invitation with one tap
   - Automatic room joining when accepting

3. **Online Status**
   - Green badge for online friends (active within 5 minutes)
   - Offline status for inactive friends
   - Real-time presence tracking via lastSeen timestamp

4. **User Search**
   - Search users by display name (case-insensitive)
   - Shows friendship status (Already Friends / Request Pending / Add Friend)
   - Debounced search (500ms) for performance
   - Maximum 20 results per query
   - Prevents duplicate requests and validates friendships

### New Files

1. **src/screens/FriendsScreen.tsx** ⭐ NEW
   - Two-tab interface: "My Friends" and "Requests"
   - Real-time friend list with online status indicators
   - Accept/decline buttons for friend requests
   - Remove friend with confirmation modal
   - Pull-to-refresh functionality
   - Empty states with call-to-action

2. **src/screens/AddFriendScreen.tsx** ⭐ NEW
   - Search bar with debounced input
   - User result cards showing friendship status
   - Send friend request with success modal
   - Empty states for search guidance
   - Real-time validation of friendship status

3. **src/services/friendService.ts** ⭐ NEW
   - Complete Firebase service for friend management
   - User presence tracking
   - Friend request operations
   - Party invitation management
   - Real-time listeners for all data

### Modified Files

1. **src/types.ts** ✏️ MODIFIED
   - Added `Friends` to TabParamList
   - Added `AddFriend` to RootStackParamList
   - Extended `WatchPartyRoom` with:
     - `privacy?: 'public' | 'friends-only'`
     - `invitedFriends?: string[]`
   - Added new types:
     - `FriendRequest` - friend request document
     - `Friend` - friend relationship
     - `UserSearchResult` - search results with status
     - `PartyInvitation` - party invitation from friend

2. **src/screens/CreatePartyScreen.tsx** ✏️ MODIFIED
   - Added privacy selector (Public/Friends Only)
   - Friend selector with multi-select chips
   - Loads user's friends on mount
   - Info box shows selected friend count
   - Passes privacy and friend selections to createParty

3. **src/screens/PartyHubScreen.tsx** ✏️ MODIFIED
   - Party Invitations section with badge
   - Invitation cards with friend avatar and movie title
   - Accept/decline buttons with loading states
   - Real-time listener for new invitations
   - Automatic room joining on accept

4. **src/services/watchPartyService.ts** ✏️ MODIFIED
   - Updated `createRoom()` to accept:
     - `privacy?: 'public' | 'friends-only'`
     - `invitedFriends?: string[]`
   - Added `partyInvitationService`:
     - `sendInvitations()` - send to multiple friends
     - `isUserInvited()` - check invitation status
     - `validateAccess()` - validate join permission
   - Added `partyInvitationsCol()` helper

5. **src/context/WatchPartyContext.tsx** ✏️ MODIFIED
   - Updated `createParty()` signature to accept:
     - `roomName?: string`
     - `privacy?: 'public' | 'friends-only'`
     - `invitedFriends?: string[]`
   - Passes new parameters to watchPartyService.createRoom()

6. **src/navigation/TabNavigator.tsx** ✏️ MODIFIED
   - Added `UserPlus` icon import
   - Added `FriendsScreen` import
   - Added Friends tab to TAB_CONFIG with UserPlus icon
   - Added Friends tab screen

7. **src/navigation/RootNavigator.tsx** ✏️ MODIFIED
   - Added `AddFriendScreen` import
   - Added AddFriend route with slide_from_bottom animation

### Data Structures

#### Friend
```typescript
{
  uid: string;
  displayName: string;
  photoUrl?: string;
  friendsSince: string; // ISO-8601
  lastSeen?: string; // ISO-8601
  isOnline?: boolean; // Computed: lastSeen within 5 minutes
}
```

#### FriendRequest
```typescript
{
  id: string;
  fromUid: string;
  fromDisplayName: string;
  fromPhotoUrl?: string;
  toUid: string;
  toDisplayName: string;
  toPhotoUrl?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string; // ISO-8601
  respondedAt?: string; // ISO-8601
}
```

#### PartyInvitation
```typescript
{
  id: string;
  roomId: string;
  fromUid: string;
  fromDisplayName: string;
  fromPhotoUrl?: string;
  toUid: string;
  room: WatchPartyRoom; // Full room data for display
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string; // ISO-8601
  respondedAt?: string; // ISO-8601
}
```

#### UserSearchResult
```typescript
{
  uid: string;
  displayName: string;
  photoUrl?: string;
  isFriend: boolean; // Already friends
  hasPendingRequest: boolean; // Request exists (sent or received)
}
```

### Firestore Structure

```
users/{uid}
  - displayName: string
  - photoUrl: string | null
  - lastSeen: string (ISO-8601)

users/{uid}/friends/{friendUid}
  - uid: string
  - displayName: string
  - photoUrl: string | undefined
  - friendsSince: string (ISO-8601)

friendRequests/{requestId}
  - id: string
  - fromUid: string
  - fromDisplayName: string
  - fromPhotoUrl: string | undefined
  - toUid: string
  - toDisplayName: string
  - toPhotoUrl: string | undefined
  - status: 'pending' | 'accepted' | 'declined'
  - createdAt: string (ISO-8601)
  - respondedAt: string | undefined (ISO-8601)

partyInvitations/{invitationId}
  - id: string
  - roomId: string
  - fromUid: string
  - fromDisplayName: string
  - fromPhotoUrl: string | undefined
  - toUid: string
  - room: WatchPartyRoom (embedded)
  - status: 'pending' | 'accepted' | 'declined'
  - createdAt: string (ISO-8601)
  - respondedAt: string | undefined (ISO-8601)

watchParties/{roomId}
  ... (existing fields)
  - privacy: 'public' | 'friends-only' (default: 'public')
  - invitedFriends: string[] (array of UIDs)
```

### Service Methods

#### friendService

**User Presence**
- `updatePresence(uid)` - Update last seen timestamp for online status
- `updateUserProfile(uid, displayName, photoUrl)` - Set profile for search

**User Search**
- `searchUsers(currentUid, query)` - Search users by display name with status

**Friend Requests**
- `sendFriendRequest(params)` - Send request with validation (prevents duplicates)
- `acceptFriendRequest(requestId)` - Create bidirectional friendship
- `declineFriendRequest(requestId)` - Mark request as declined
- `cancelFriendRequest(requestId)` - Delete sent request before response
- `getReceivedRequests(uid)` - Fetch pending received requests
- `getSentRequests(uid)` - Fetch pending sent requests
- `onReceivedRequests(uid, callback)` - Real-time listener for received requests

**Friends List**
- `getFriends(uid)` - Get friends with online status (sorted: online first, then alphabetical)
- `onFriends(uid, callback)` - Real-time listener for friends list
- `removeFriend(uid, friendUid)` - Remove friendship (bidirectional delete)

**Party Invitations**
- `getPartyInvitations(uid)` - Fetch pending party invitations
- `onPartyInvitations(uid, callback)` - Real-time listener for invitations
- `acceptPartyInvitation(invitationId)` - Mark invitation as accepted
- `declinePartyInvitation(invitationId)` - Mark invitation as declined

#### watchPartyService.invitations

- `sendInvitations(params)` - Send invitations to multiple friends (batch write)
- `isUserInvited(roomId, uid)` - Check if user has been invited to room
- `validateAccess(room, uid)` - Validate if user can join based on privacy settings

### Navigation Flow

```
Friends Tab (FriendsScreen)
├── My Friends Tab
│   ├── Friend cards with avatar + online status badge
│   ├── Tap Options → Remove friend modal
│   └── Add Friend button (top right) → AddFriendScreen
│
└── Requests Tab
    ├── Received Requests
    │   ├── Friend avatar + name
    │   └── Accept (green) / Decline (red) buttons
    └── Sent Requests
        ├── Friend avatar + name
        ├── "Pending" badge
        └── Cancel (X) button

AddFriendScreen
├── Search bar (debounced 500ms, min 2 chars)
├── User result cards
│   ├── Avatar + display name
│   ├── Status badge (Friends / Request Pending)
│   └── Add Friend button (if not friends)
├── Send request → Success modal
└── Navigate back to Friends

Party Hub (PartyHubScreen)
├── Party Invitations Section (if any)
│   ├── Section header with Mail icon + badge count
│   ├── Invitation cards:
│   │   ├── Friend avatar + name
│   │   ├── "invited you to watch [Movie Title]"
│   │   └── Accept (green) / Decline (red) buttons
│   └── Accept → Automatically joins room + navigates to WatchPartyScreen
│
└── Active Parties Section
    └── (existing party cards)

Create Party (CreatePartyScreen)
├── Party Name input (optional)
├── Select Content → Search callback
├── Privacy Selector
│   ├── Public (Globe icon)
│   │   └── "Anyone with the code can join"
│   └── Friends Only (Lock icon)
│       └── "Only invited friends can join"
├── Invite Friends (if have friends)
│   ├── Friend chips with avatars (multi-select)
│   └── Selected count badge
├── Info box shows invitation count
└── Create Party → Sends invitations in background
```

### UI Components

#### FriendsScreen
- **Header**: Title + Add Friend button (UserPlus icon)
- **Tabs**: My Friends / Requests with badge count
- **Friend Cards**: 
  - Avatar with online badge (green dot)
  - Display name + online/offline status
  - Options button (MoreVertical icon) → Remove modal
- **Request Cards**:
  - Received: Avatar, name, "sent you a friend request", Accept/Decline
  - Sent: Avatar, name, "Pending" badge, Cancel button
- **Empty States**: Illustrations with call-to-action buttons
- **Pull-to-Refresh**: Reload friends and requests
- **Real-time Updates**: Instant UI updates via listeners

#### AddFriendScreen
- **Header**: "Add Friend" title + Close button
- **Search Bar**: Icon, input, clear button
- **Search Hint**: "Enter at least 2 characters"
- **User Result Cards**:
  - Avatar (or placeholder with Users icon)
  - Display name
  - Status badge (check icon for friends, clock for pending)
  - Add button (UserPlus icon, NF_RED background)
- **Success Modal**: "Friend Request Sent!" with purple icon
- **Empty States**: "Search for Friends" / "No Users Found"

#### CreatePartyScreen (Enhanced)
- **Privacy Options**:
  - Radio-style cards with icons
  - Public (Globe) / Friends Only (Lock)
  - Active state: red border + tinted background
- **Friend Selector**:
  - Horizontal wrap of friend chips
  - Avatar + name, selectable
  - Selected: red border + tinted background + check icon
  - Loading spinner while fetching friends
- **Info Box**: Dynamic text showing selected friend count

#### PartyHubScreen (Enhanced)
- **Invitations Section**:
  - Section header: Mail icon + "Party Invitations" + badge
  - Red-tinted invitation cards (stands out from party cards)
  - Friend avatar + name + movie title inline
  - Accept (green circle) / Decline (red circle) buttons
  - Loading spinner on Accept
- **Badge Count**: Shows number of pending invitations

### Search Implementation

**Current Approach** (Basic Firestore Query):
- Query users collection where `displayName >= query` and `displayName <= query + '\uf8ff'`
- Client-side case-insensitive filter
- Cross-reference with friends and pending requests to set status
- Limit 20 results
- Works for small-medium user bases

**Production Optimization** (for scale):
1. **Algolia Integration**:
   - Full-text search with typo tolerance
   - Instant results as you type
   - Faceted filtering
   - Cloud function to sync users to Algolia index

2. **Cloud Functions Trigram Search**:
   - Index displayName as trigrams in Firestore
   - Query multiple trigrams for fuzzy matching
   - More cost-effective than Algolia

3. **Firestore Composite Indexes**:
   - Index displayName + uid for efficient queries
   - Still requires exact prefix match

### Online Status Logic

```typescript
// User is online if lastSeen within 5 minutes
const isOnline = lastSeen
  ? (new Date().getTime() - new Date(lastSeen).getTime()) < 5 * 60 * 1000
  : false;
```

**Presence Updates**:
- Called on app launch
- Called periodically while app is active (via friendService.updatePresence)
- Friends list sorted: online first, then alphabetical

### Privacy & Access Control

**Room Privacy Validation**:
```typescript
// Public rooms: anyone can join
if (room.privacy === 'public' || !room.privacy) return true;

// Friends-only rooms: must be invited
if (room.privacy === 'friends-only') {
  if (room.hostUid === uid) return true; // Host always allowed
  return await isUserInvited(room.roomId, uid); // Check invitation
}
```

**Friend Invitation Flow**:
1. Host selects friends in CreatePartyScreen
2. Party created with `invitedFriends` array
3. `partyInvitationService.sendInvitations()` creates invitation documents
4. Invitees see invitations in Party Hub (real-time)
5. Accept → `friendService.acceptPartyInvitation()` + `watchPartyService.joinRoom()`
6. Decline → `friendService.declinePartyInvitation()` (removes from list)

### Testing Checklist

- [x] ✅ Friends tab appears in navigation
- [x] ✅ Add friend search works with debounce
- [x] ✅ Friend request send/accept/decline flow
- [x] ✅ Friend list shows online status
- [x] ✅ Remove friend with confirmation
- [x] ✅ Real-time updates for friends and requests
- [x] ✅ Privacy selector in CreatePartyScreen
- [x] ✅ Friend selector with multi-select
- [x] ✅ Party invitations appear in Party Hub
- [x] ✅ Accept invitation joins room automatically
- [x] ✅ Decline invitation removes from list
- [x] ✅ Friends-only rooms reject uninvited users
- [ ] User presence updates periodically
- [ ] Search handles large result sets
- [ ] Duplicate request prevention works
- [ ] Profile updates sync to friends list

### Future Enhancements

1. **Friend Recommendations**
   - Mutual friends discovery
   - "People you may know" suggestions
   - Import contacts integration

2. **Enhanced Search**
   - Algolia integration for typo tolerance
   - Search by username/handle (in addition to display name)
   - Filter by online status

3. **Social Features**
   - Block/unblock users
   - Friend notes/nicknames
   - Recently played together list
   - Friend activity feed

4. **Party Features**
   - "Invite all friends" quick action
   - Friend groups for bulk invites
   - Recurring watch parties with friend list
   - Party templates with default friend list

---

## Migration Notes

### Removed Features
- Floating watch party button in Movies/TV screens (moved to Party tab)

### Backward Compatibility
- Existing watch party rooms will work but won't have new fields
- Firebase will auto-add default values where needed:
  - `roomName` → undefined
  - `activePoll` → null
  - `lastActivityAt` → use `createdAt` as fallback
  - `hostConnected` → true (default)

## Testing Checklist

- [ ] Party Hub shows active parties for signed-in users
- [ ] Create party flow works end-to-end
- [ ] Join party with room code works
- [ ] Party cards display correct status badges
- [ ] 15 member limit enforced
- [ ] 10 minute inactivity timeout triggers
- [ ] Host disconnect grace period (5 min) works
- [ ] Host reconnect clears grace period
- [ ] Party tab icon highlights correctly
- [ ] Sign-in prompt shown for non-authenticated users
- [ ] Refresh pull-to-refresh updates party list
- [x] ✅ Poll system fully functional (see POLL_IMPLEMENTATION.md for detailed tests)

## Known Limitations

1. ~~**Content Selection**: CreatePartyScreen currently navigates to Search but doesn't have callback to receive selected item (needs implementation)~~ **✅ IMPLEMENTED**
2. ~~**Poll System**: UI and service methods not yet implemented~~ **✅ IMPLEMENTED**
3. ~~**Friend List**: No friend management system yet (uses room codes only)~~ **✅ IMPLEMENTED**
4. **User Search**: Basic Firestore query with client-side filtering (consider Algolia for scale)
5. **Notifications**: No push notification integration
6. **Party History**: Past parties not displayed (only active ones)
7. **Friend Recommendations**: No mutual friends or suggestions yet

## Next Steps

1. ~~Implement content selection flow in CreatePartyScreen~~ **✅ COMPLETED**
2. ~~Build poll creation and voting UI~~ **✅ COMPLETED**
3. ~~Implement poll service methods~~ **✅ COMPLETED**
4. ~~Add friend list integration~~ **✅ COMPLETED**
5. Add push notifications for party and friend events
6. Add party history view
7. Improve user search (consider Algolia integration)
8. Add friend recommendations and mutual friends
9. Test timeout behaviors thoroughly
10. Add analytics tracking for party and friend usage

---

## Implementation Details

### Content Selection Flow ✅

The content selection callback system has been implemented to allow CreatePartyScreen to receive the selected media item from SearchScreen.

**Changes made:**

1. **types.ts** - Updated `RootStackParamList`:
   ```typescript
   Search: { onSelect?: (item: MediaItem) => void } | undefined;
   ```
   Added optional `onSelect` callback parameter to the Search route.

2. **SearchScreen.tsx** - Enhanced to support callback mode:
   - Added `useRoute` to access route params
   - Extract `onSelect` callback from route params
   - Created `handleItemPress` function that:
     - If `onSelect` exists: calls it with selected item and navigates back
     - Otherwise: uses default behavior (navigate to Details)
   - Pass `onPress` prop to MediaCard with `handleItemPress`

3. **MediaCard.tsx** - Made component flexible for different contexts:
   - Added optional `onPress?: (item: MediaItem) => void` prop
   - Modified `handleDetails` to use custom `onPress` if provided
   - Falls back to default Details navigation when no custom handler

4. **CreatePartyScreen.tsx** - Implemented callback usage:
   - Updated `handleSelectContent` to pass callback when navigating to Search
   - Callback sets `selectedItem` state when user selects content
   - User returns to CreateParty screen with selection populated

**Flow:**
```
CreatePartyScreen
  └─> Tap "Browse Library"
      └─> Navigate to Search with onSelect callback
          └─> User searches and taps a MediaCard
              └─> MediaCard calls onPress → handleItemPress
                  └─> handleItemPress calls onSelect(item)
                      └─> Navigate back to CreatePartyScreen
                          └─> selectedItem state updated
                              └─> Selected content displayed
```
