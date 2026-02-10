// API 설정
const API_BASE_URL = 'https://gongbu-grow-backend-production.up.railway.app/api'; // 로컬 개발용
// const API_BASE_URL = 'https://your-backend.railway.app/api'; // 배포 시 변경

// 로컬 스토리지 키
const STORAGE_KEYS = {
    TOKEN: 'gongbu_token',
    USER: 'gongbu_user'
};

// API 호출 헬퍼
const api = {
    // 인증
    async auth(userData) {
        const response = await fetch(`${API_BASE_URL}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        return response.json();
    },
    
    // 학습 기록 추가
    async addStudyLog(logData) {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/study-logs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(logData)
        });
        return response.json();
    },
    
    // 학습 기록 조회
    async getStudyLogs(startDate, endDate) {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        let url = `${API_BASE_URL}/study-logs`;
        if (startDate && endDate) {
            url += `?startDate=${startDate}&endDate=${endDate}`;
        }
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },
    
    // 학습 기록 삭제
    async deleteStudyLog(logId) {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/study-logs/${logId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },
    
    // 성적 추가
    async addGrade(gradeData) {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/grades`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(gradeData)
        });
        return response.json();
    },
    
    // 성적 조회
    async getGrades() {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/grades`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },
    
    // 통계 조회
    async getActiveStats() {
        const response = await fetch(`${API_BASE_URL}/stats/active`);
        return response.json();
    },
    
    // 사용자 통계
    async getUserStats() {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/stats/user`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },
    
    // 라이벌 (같은 학교)
    async getSchoolRivals() {
        const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
        const response = await fetch(`${API_BASE_URL}/rivals/school`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.json();
    },
    
   // 전국 랭킹 - 학교급 파라미터 추가
async getGlobalRank(schoolLevel) {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    let url = `${API_BASE_URL}/rivals/global`;
    
    // 학교급이 지정되면 쿼리 파라미터로 전달
    if (schoolLevel) {
        url += `?schoolLevel=${encodeURIComponent(schoolLevel)}`;
    }
    
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.json();
    }
};

// 인증 상태 확인
function isAuthenticated() {
    return !!localStorage.getItem(STORAGE_KEYS.TOKEN);
}

// 로그아웃
function logout() {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    window.location.href = 'index.html';
}

// 사용자 정보 가져오기
function getCurrentUser() {
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);
    return userStr ? JSON.parse(userStr) : null;
}
