// 全局变量
let videos = [];

// 页面加载完成后初始化
window.onload = function() {
    // 检查登录状态
    if (!checkLoginStatus()) {
        window.location.href = '../login.html?next=video/';
        return;
    }
    
    // 初始化应用
    initApp();
};

// 检查登录状态
function checkLoginStatus() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const loginTime = localStorage.getItem('loginTime');
    
    if (!isLoggedIn || !loginTime) {
        return false;
    }
    
    // 检查是否超过3分钟（180000毫秒）
    const currentTime = Date.now();
    const loginTimestamp = parseInt(loginTime);
    
    if (currentTime - loginTimestamp > 180000) {
        // 会话超时，清除登录状态
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('loginTime');
        return false;
    }
    
    // 更新登录时间，重置超时计时器
    localStorage.setItem('loginTime', currentTime.toString());
    return true;
}

// 初始化应用
function initApp() {
    // 绑定退出登录事件
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            logout();
        });
    }
    
    // 加载视频列表
    loadVideos();
}

// 退出登录
function logout() {
    if (window.confirm('确定要退出登录吗？')) {
        // 清除登录状态
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('loginTime');
        // 跳转到登录页面
        setTimeout(function() {
            window.location.href = '../login.html';
        }, 100);
    }
}

// 加载视频列表
function loadVideos() {
    // 从 videos.json 文件加载视频列表
    fetch('../videos/videos.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data && data.videos && Array.isArray(data.videos)) {
                // 处理视频URL，添加完整路径
                videos = data.videos.map(video => ({
                    ...video,
                    url: `../videos/${video.url}`
                }));
            } else {
                // 如果 JSON 格式不正确，使用默认视频
                videos = getDefaultVideos();
            }
            renderVideoList();
        })
        .catch(error => {
            console.error('加载视频列表时出错:', error);
            // 加载失败时使用默认视频
            videos = getDefaultVideos();
            renderVideoList();
        });
}

// 获取默认视频列表
function getDefaultVideos() {
    return [
        { id: 1, name: '视频1', url: '../videos/video1.mp4' },
        { id: 2, name: '视频2', url: '../videos/video2.mp4' },
        { id: 3, name: '视频3', url: '../videos/video3.mp4' }
    ];
}

// 渲染视频列表
function renderVideoList() {
    const videoEntries = document.getElementById('videoEntries');
    
    if (videos.length === 0) {
        videoEntries.innerHTML = '<div class="empty-state">暂无视频，您可以在videos文件夹中添加视频</div>';
        return;
    }
    
    videoEntries.innerHTML = '';
    
    videos.forEach((video) => {
        const videoEl = document.createElement('div');
        videoEl.className = 'video-entry';
        videoEl.innerHTML = `
            <h4>${video.name}</h4>
            <div class="actions">
                <button class="play-btn" onclick="playVideo('${video.url}', '${video.name}')">播放</button>
            </div>
        `;
        videoEntries.appendChild(videoEl);
    });
    
    // 自动播放第一个视频
    if (videos.length > 0) {
        playVideo(videos[0].url, videos[0].name);
    }
}

// 播放视频
function playVideo(url, name) {
    const videoPlayer = document.getElementById('videoPlayer');
    const videoTitle = document.getElementById('videoTitle');
    
    // 设置视频源
    videoPlayer.src = url;
    videoTitle.textContent = name;
    
    // 视频加载完成后暂停
    videoPlayer.onloadedmetadata = function() {
        videoPlayer.pause();
    };
    
    // 尝试加载视频
    videoPlayer.load();
}
