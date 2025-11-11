require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ===========================
// MIDDLEWARE
// ===========================
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'chat-app-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set true if using HTTPS
}));
app.use(passport.initialize());
app.use(passport.session());

// ===========================
// DATABASE (In-memory)
// ===========================
let users = {};
let friendships = {};
let messages = {};
let onlineUsers = {};
let userPreferences = {}; // Store theme, avatar preferences

// ===========================
// AVATAR API INTEGRATION
// ===========================
const AVATAR_APIS = {
  dicebear: 'https://api.dicebear.com/7.x',
  robohash: 'https://robohash.org',
  avataaars: 'https://avataaars.io',
  boringavatars: 'https://source.boringavatars.com'
};

function generateAvatarUrl(userId, style = 'avataaars') {
  const styles = ['adventurer', 'avataaars', 'bottts', 'personas', 'pixel-art', 'thumbs'];
  const selectedStyle = styles.includes(style) ? style : 'avataaars';
  return `${AVATAR_APIS.dicebear}/${selectedStyle}/svg?seed=${userId}`;
}

// ===========================
// PASSPORT CONFIGURATION
// ===========================
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = Object.values(users).find(u => u.id === id);
  done(null, user);
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback"
  },
  (accessToken, refreshToken, profile, done) => {
    let user = Object.values(users).find(u => u.googleId === profile.id);
    
    if (!user) {
      const userId = 'user_google_' + Date.now();
      user = {
        id: userId,
        googleId: profile.id,
        username: profile.emails[0].value.split('@')[0],
        displayName: profile.displayName,
        email: profile.emails[0].value,
        avatar: profile.photos[0]?.value || generateAvatarUrl(userId),
        authProvider: 'google',
        createdAt: new Date().toISOString()
      };
      users[user.username] = user;
      friendships[userId] = [];
      userPreferences[userId] = { theme: 'light', avatarStyle: 'avataaars' };
    }
    
    return done(null, user);
  }));
}

// Facebook OAuth Strategy
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL || "http://localhost:3000/auth/facebook/callback",
    profileFields: ['id', 'displayName', 'photos', 'email']
  },
  (accessToken, refreshToken, profile, done) => {
    let user = Object.values(users).find(u => u.facebookId === profile.id);
    
    if (!user) {
      const userId = 'user_fb_' + Date.now();
      user = {
        id: userId,
        facebookId: profile.id,
        username: profile.displayName.toLowerCase().replace(/\s+/g, '_'),
        displayName: profile.displayName,
        email: profile.emails?.[0]?.value,
        avatar: profile.photos[0]?.value || generateAvatarUrl(userId),
        authProvider: 'facebook',
        createdAt: new Date().toISOString()
      };
      users[user.username] = user;
      friendships[userId] = [];
      userPreferences[userId] = { theme: 'light', avatarStyle: 'avataaars' };
    }
    
    return done(null, user);
  }));
}

// ===========================
// OAUTH ROUTES
// ===========================
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect(`/?token=${req.user.id}`);
  }
);

app.get('/auth/facebook',
  passport.authenticate('facebook', { scope: ['email'] })
);

app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect(`/?token=${req.user.id}`);
  }
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// ===========================
// API ENDPOINTS
// ===========================

// Register
app.post('/api/register', (req, res) => {
  const { username, displayName, password } = req.body;
  
  if (!username || !displayName || !password) {
    return res.status(400).json({ error: 'Thiếu thông tin!' });
  }
  
  if (users[username]) {
    return res.status(400).json({ error: 'Username đã tồn tại!' });
  }
  
  const userId = 'user_' + Date.now();
  const avatarUrl = generateAvatarUrl(userId);
  
  users[username] = {
    id: userId,
    username,
    displayName,
    password,
    avatar: avatarUrl,
    authProvider: 'local',
    createdAt: new Date().toISOString()
  };
  
  friendships[userId] = [];
  userPreferences[userId] = { theme: 'light', avatarStyle: 'avataaars' };
  
  res.json({ 
    success: true, 
    user: { 
      id: userId, 
      username, 
      displayName,
      avatar: avatarUrl
    } 
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  const user = users[username];
  
  if (!user) {
    return res.status(401).json({ error: 'Username không tồn tại!' });
  }
  
  if (user.password !== password) {
    return res.status(401).json({ error: 'Sai mật khẩu!' });
  }
  
  res.json({ 
    success: true, 
    user: { 
      id: user.id, 
      username: user.username, 
      displayName: user.displayName,
      avatar: user.avatar || generateAvatarUrl(user.id)
    }
  });
});

// Get user by token (for OAuth)
app.get('/api/user/:userId', (req, res) => {
  const userId = req.params.userId;
  const user = Object.values(users).find(u => u.id === userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    preferences: userPreferences[userId] || { theme: 'light', avatarStyle: 'avataaars' }
  });
});

// Search users
app.get('/api/users/search', (req, res) => {
  const query = req.query.q?.toLowerCase() || '';
  const currentUserId = req.query.userId;
  
  const results = Object.values(users)
    .filter(u => {
      if (u.id === currentUserId) return false;
      return u.username.toLowerCase().includes(query) || 
             u.displayName.toLowerCase().includes(query) ||
             u.id.toLowerCase().includes(query);
    })
    .map(u => ({ 
      id: u.id, 
      username: u.username, 
      displayName: u.displayName,
      avatar: u.avatar || generateAvatarUrl(u.id)
    }));
  
  res.json(results);
});

// Get friends
app.get('/api/friends/:userId', (req, res) => {
  const userId = req.params.userId;
  const friendIds = friendships[userId] || [];
  
  const friends = friendIds.map(friendId => {
    const user = Object.values(users).find(u => u.id === friendId);
    if (user) {
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar || generateAvatarUrl(user.id),
        online: !!onlineUsers[user.id]
      };
    }
    return null;
  }).filter(Boolean);
  
  res.json(friends);
});

// Add friend
app.post('/api/friends/add', (req, res) => {
  const { userId, friendId } = req.body;
  
  if (!friendships[userId]) friendships[userId] = [];
  if (!friendships[friendId]) friendships[friendId] = [];
  
  if (!friendships[userId].includes(friendId)) {
    friendships[userId].push(friendId);
  }
  
  if (!friendships[friendId].includes(userId)) {
    friendships[friendId].push(userId);
  }
  
  res.json({ success: true });
});

// Get messages
app.get('/api/messages/:userId/:friendId', (req, res) => {
  const { userId, friendId } = req.params;
  const chatKey = [userId, friendId].sort().join('_');
  
  res.json(messages[chatKey] || []);
});

// Update user preferences
app.put('/api/preferences/:userId', (req, res) => {
  const userId = req.params.userId;
  const { theme, avatarStyle } = req.body;
  
  if (!userPreferences[userId]) {
    userPreferences[userId] = {};
  }
  
  if (theme) userPreferences[userId].theme = theme;
  if (avatarStyle) {
    userPreferences[userId].avatarStyle = avatarStyle;
    const user = Object.values(users).find(u => u.id === userId);
    if (user) {
      user.avatar = generateAvatarUrl(userId, avatarStyle);
    }
  }
  
  res.json({ success: true, preferences: userPreferences[userId] });
});

// Get avatar styles
app.get('/api/avatar/styles', (req, res) => {
  res.json({
    styles: [
      { id: 'adventurer', name: 'Adventurer', preview: 'https://api.dicebear.com/7.x/adventurer/svg?seed=preview' },
      { id: 'avataaars', name: 'Avataaars', preview: 'https://api.dicebear.com/7.x/avataaars/svg?seed=preview' },
      { id: 'bottts', name: 'Bottts', preview: 'https://api.dicebear.com/7.x/bottts/svg?seed=preview' },
      { id: 'personas', name: 'Personas', preview: 'https://api.dicebear.com/7.x/personas/svg?seed=preview' },
      { id: 'pixel-art', name: 'Pixel Art', preview: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=preview' },
      { id: 'thumbs', name: 'Thumbs', preview: 'https://api.dicebear.com/7.x/thumbs/svg?seed=preview' }
    ]
  });
});

// Update avatar
app.post('/api/avatar/update', (req, res) => {
  const { userId, style } = req.body;
  
  const user = Object.values(users).find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  user.avatar = generateAvatarUrl(userId, style);
  
  if (!userPreferences[userId]) {
    userPreferences[userId] = {};
  }
  userPreferences[userId].avatarStyle = style;
  
  res.json({ success: true, avatar: user.avatar });
});

// ===========================
// SOCKET.IO - REALTIME
// ===========================
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);
  
  socket.on('user_online', (userId) => {
    onlineUsers[userId] = socket.id;
    console.log('👤 User online:', userId);
    
    if (friendships[userId]) {
      friendships[userId].forEach(friendId => {
        const friendSocketId = onlineUsers[friendId];
        if (friendSocketId) {
          io.to(friendSocketId).emit('friend_online', userId);
        }
      });
    }
  });
  
  socket.on('send_message', (data) => {
    const { senderId, receiverId, text, type = 'text' } = data;
    
    const message = {
      id: 'msg_' + Date.now(),
      senderId,
      receiverId,
      text,
      type,
      timestamp: new Date().toISOString()
    };
    
    const chatKey = [senderId, receiverId].sort().join('_');
    if (!messages[chatKey]) messages[chatKey] = [];
    messages[chatKey].push(message);
    
    const receiverSocketId = onlineUsers[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receive_message', message);
    }
    
    socket.emit('message_sent', message);
    
    console.log('📨 Message:', senderId, '->', receiverId);
  });
  
  socket.on('typing', (data) => {
    const receiverSocketId = onlineUsers[data.receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', {
        userId: data.senderId,
        typing: data.typing
      });
    }
  });
  
  socket.on('disconnect', () => {
    const userId = Object.keys(onlineUsers).find(
      key => onlineUsers[key] === socket.id
    );
    
    if (userId) {
      delete onlineUsers[userId];
      console.log('❌ User offline:', userId);
      
      if (friendships[userId]) {
        friendships[userId].forEach(friendId => {
          const friendSocketId = onlineUsers[friendId];
          if (friendSocketId) {
            io.to(friendSocketId).emit('friend_offline', userId);
          }
        });
      }
    }
  });
});

// ===========================
// START SERVER
// ===========================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
  ========================================
  🚀 Server đang chạy tại:
  
     http://localhost:${PORT}
  
  📡 Socket.IO ready for realtime chat!
  🔐 OAuth configured (Google, Facebook)
  🎨 Avatar API integrated
  🌓 Theme system enabled
  ========================================
  `);
});