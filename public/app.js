// ===========================
// KẾT NỐI SOCKET.IO
// ===========================
const socket = io('http://localhost:3000');

// ===========================
// BIẾN TOÀN CỤC
// ===========================
let currentUser = null;
let friends = [];
let selectedFriend = null;
let messages = {};

// ===========================
// SOCKET EVENTS
// ===========================
socket.on('connect', () => {
  console.log('✅ Connected to server');
  if (currentUser) {
    socket.emit('user_online', currentUser.id);
  }
});

socket.on('receive_message', (message) => {
  console.log('📨 Received message:', message);
  
  const chatKey = getChatKey(message.senderId, message.receiverId);
  if (!messages[chatKey]) messages[chatKey] = [];
  messages[chatKey].push(message);
  
  // Cập nhật giao diện nếu đang chat với người này
  if (selectedFriend && selectedFriend.id === message.senderId) {
    renderMessages();
  }
  
  // Hiển thị thông báo (optional)
  if (Notification.permission === 'granted') {
    const sender = friends.find(f => f.id === message.senderId);
    if (sender) {
      new Notification(sender.displayName, {
        body: message.text,
        icon: '💬'
      });
    }
  }
});

socket.on('message_sent', (message) => {
  console.log('✅ Message sent:', message);
});

socket.on('friend_online', (userId) => {
  console.log('🟢 Friend online:', userId);
  const friend = friends.find(f => f.id === userId);
  if (friend) {
    friend.online = true;
    renderFriendsList();
  }
});

socket.on('friend_offline', (userId) => {
  console.log('🔴 Friend offline:', userId);
  const friend = friends.find(f => f.id === userId);
  if (friend) {
    friend.online = false;
    renderFriendsList();
  }
});

socket.on('user_typing', (data) => {
  if (selectedFriend && data.userId === selectedFriend.id) {
    // Hiển thị "đang nhập..."
    showTypingIndicator(true);
    setTimeout(() => showTypingIndicator(false), 2000);
  }
});

// ===========================
// KHỞI ĐỘNG ỨNG DỤNG
// ===========================
window.onload = function() {
  // Yêu cầu quyền thông báo
  if (Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
  
  // Đăng ký sự kiện form
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('registerForm').addEventListener('submit', handleRegister);
  
  // Typing indicator
  document.getElementById('messageInput').addEventListener('input', handleTyping);
};

// ===========================
// XỬ LÝ ĐĂNG NHẬP
// ===========================
async function handleLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  
  try {
    const response = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      alert('❌ ' + data.error);
      return;
    }
    
    currentUser = data.user;
    socket.emit('user_online', currentUser.id);
    
    showMainScreen();
  } catch (error) {
    alert('❌ Lỗi kết nối server!');
    console.error(error);
  }
}

// ===========================
// XỬ LÝ ĐĂNG KÝ
// ===========================
async function handleRegister(e) {
  e.preventDefault();
  
  const username = document.getElementById('regUsername').value.trim();
  const displayName = document.getElementById('regDisplayName').value.trim();
  const password = document.getElementById('regPassword').value;
  
  if (!username || !displayName || !password) {
    alert('❌ Vui lòng điền đầy đủ thông tin!');
    return;
  }
  
  try {
    const response = await fetch('http://localhost:3000/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      alert('❌ ' + data.error);
      return;
    }
    
    alert('✅ Đăng ký thành công! Hãy đăng nhập.');
    switchToLogin();
  } catch (error) {
    alert('❌ Lỗi kết nối server!');
    console.error(error);
  }
}

// ===========================
// CHUYỂN SCREEN
// ===========================
function switchToLogin() {
  document.getElementById('loginScreen').classList.add('active');
  document.getElementById('registerScreen').classList.remove('active');
  document.getElementById('mainScreen').classList.remove('active');
}

function switchToRegister() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('registerScreen').classList.add('active');
  document.getElementById('mainScreen').classList.remove('active');
}

function showMainScreen() {
  document.getElementById('loginScreen').classList.remove('active');
  document.getElementById('registerScreen').classList.remove('active');
  document.getElementById('mainScreen').classList.add('active');
  
  document.getElementById('currentUserName').textContent = currentUser.displayName;
  
  loadFriends();
}

// ===========================
// TẢI DỮ LIỆU
// ===========================
async function loadFriends() {
  try {
    const response = await fetch(`http://localhost:3000/api/friends/${currentUser.id}`);
    friends = await response.json();
    renderFriendsList();
  } catch (error) {
    console.error('Error loading friends:', error);
  }
}

async function loadMessages(friendId) {
  try {
    const response = await fetch(`http://localhost:3000/api/messages/${currentUser.id}/${friendId}`);
    const msgs = await response.json();
    
    const chatKey = getChatKey(currentUser.id, friendId);
    messages[chatKey] = msgs;
    
    renderMessages();
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

// ===========================
// HIỂN THỊ DANH SÁCH BẠN BÈ
// ===========================
function renderFriendsList() {
  const friendsList = document.getElementById('friendsList');
  
  if (friends.length === 0) {
    friendsList.innerHTML = '<p class="empty-message">Chưa có bạn bè. Nhấn + để kết bạn!</p>';
    return;
  }
  
  friendsList.innerHTML = '';
  
  friends.forEach(friend => {
    const friendItem = document.createElement('div');
    friendItem.className = 'friend-item';
    if (selectedFriend && selectedFriend.id === friend.id) {
      friendItem.classList.add('active');
    }
    
    const firstLetter = friend.displayName.charAt(0).toUpperCase();
    const onlineStatus = friend.online ? '🟢' : '⚪';
    
    friendItem.innerHTML = `
      <div class="avatar">${firstLetter}</div>
      <div style="flex: 1;">
        <div style="font-weight: bold;">${friend.displayName} ${onlineStatus}</div>
        <div style="font-size: 12px; color: #999;">@${friend.username}</div>
      </div>
    `;
    
    friendItem.onclick = () => selectFriend(friend);
    friendsList.appendChild(friendItem);
  });
}

// ===========================
// CHỌN BẠN BÈ ĐỂ CHAT
// ===========================
function selectFriend(friend) {
  selectedFriend = friend;
  
  document.getElementById('chatWelcome').classList.remove('active');
  document.getElementById('chatBox').classList.add('active');
  
  document.getElementById('chatUserName').textContent = friend.displayName + (friend.online ? ' 🟢' : '');
  
  renderFriendsList();
  loadMessages(friend.id);
}

// ===========================
// HIỂN THỊ TIN NHẮN
// ===========================
function renderMessages() {
  if (!selectedFriend) return;
  
  const chatKey = getChatKey(currentUser.id, selectedFriend.id);
  const chatMessages = messages[chatKey] || [];
  
  const container = document.getElementById('messagesContainer');
  container.innerHTML = '';
  
  chatMessages.forEach(msg => {
    const messageDiv = document.createElement('div');
    messageDiv.className = msg.senderId === currentUser.id ? 'message sent' : 'message received';
    
    const time = new Date(msg.timestamp).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    });
    
    messageDiv.innerHTML = `
      ${msg.text}
      <span class="message-time">${time}</span>
    `;
    
    container.appendChild(messageDiv);
  });
  
  // Scroll xuống cuối
  container.scrollTop = container.scrollHeight;
}

// ===========================
// GỬI TIN NHẮN
// ===========================
function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  
  if (!text || !selectedFriend) return;
  
  // Gửi qua socket
  socket.emit('send_message', {
    senderId: currentUser.id,
    receiverId: selectedFriend.id,
    text: text
  });
  
  // Thêm vào UI ngay
  const message = {
    id: 'msg_' + Date.now(),
    senderId: currentUser.id,
    receiverId: selectedFriend.id,
    text: text,
    timestamp: new Date().toISOString()
  };
  
  const chatKey = getChatKey(currentUser.id, selectedFriend.id);
  if (!messages[chatKey]) messages[chatKey] = [];
  messages[chatKey].push(message);
  
  input.value = '';
  renderMessages();
}

function handleKeyPress(e) {
  if (e.key === 'Enter') {
    sendMessage();
  }
}

// ===========================
// TYPING INDICATOR
// ===========================
let typingTimeout;
function handleTyping() {
  if (!selectedFriend) return;
  
  socket.emit('typing', {
    senderId: currentUser.id,
    receiverId: selectedFriend.id,
    typing: true
  });
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing', {
      senderId: currentUser.id,
      receiverId: selectedFriend.id,
      typing: false
    });
  }, 1000);
}

function showTypingIndicator(show) {
  // Bạn có thể thêm UI "đang nhập..." ở đây
  console.log(selectedFriend?.displayName + (show ? ' đang nhập...' : ''));
}

// ===========================
// TÌM KIẾM BẠN BÈ
// ===========================
function showSearchFriends() {
  document.getElementById('searchModal').classList.add('active');
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
}

async function searchUsers() {
  const query = document.getElementById('searchInput').value.trim();
  const resultsContainer = document.getElementById('searchResults');
  
  if (!query) {
    resultsContainer.innerHTML = '';
    return;
  }
  
  try {
    const response = await fetch(`http://localhost:3000/api/users/search?q=${query}&userId=${currentUser.id}`);
    const results = await response.json();
    
    resultsContainer.innerHTML = '';
    
    if (results.length === 0) {
      resultsContainer.innerHTML = '<p class="empty-message">Không tìm thấy người dùng</p>';
      return;
    }
    
    results.forEach(user => {
      const resultItem = document.createElement('div');
      resultItem.className = 'search-result-item';
      
      const firstLetter = user.displayName.charAt(0).toUpperCase();
      
      resultItem.innerHTML = `
        <div class="search-result-info">
          <div class="avatar">${firstLetter}</div>
          <div class="search-result-details">
            <h4>${user.displayName}</h4>
            <p>@${user.username} • ID: ${user.id}</p>
          </div>
        </div>
        <button class="btn-add-friend" onclick="addFriend('${user.id}')">
          Kết bạn
        </button>
      `;
      
      resultsContainer.appendChild(resultItem);
    });
  } catch (error) {
    console.error('Error searching users:', error);
  }
}

async function addFriend(friendId) {
  try {
    const response = await fetch('http://localhost:3000/api/friends/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        friendId: friendId
      })
    });
    
    if (response.ok) {
      alert('✅ Đã kết bạn!');
      closeSearchModal();
      loadFriends();
    }
  } catch (error) {
    console.error('Error adding friend:', error);
  }
}

function closeSearchModal() {
  document.getElementById('searchModal').classList.remove('active');
}

// ===========================
// ĐĂNG XUẤT
// ===========================
function logout() {
  if (confirm('Bạn có chắc muốn đăng xuất?')) {
    socket.disconnect();
    currentUser = null;
    friends = [];
    selectedFriend = null;
    messages = {};
    
    switchToLogin();
  }
}

// ===========================
// HELPER FUNCTIONS
// ===========================
function getChatKey(userId1, userId2) {
  return [userId1, userId2].sort().join('_');
}
