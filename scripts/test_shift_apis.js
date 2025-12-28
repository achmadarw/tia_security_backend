const axios = require('axios');

const API_URL = 'http://localhost:3008/api';

// Test credentials - adjust as needed
const TEST_ADMIN = {
    phone: '081234567890', // Admin phone from database
    password: '123456', // Default password from seed
};

let adminToken = '';

async function login() {
    try {
        console.log('🔐 Logging in as admin...');
        const response = await axios.post(`${API_URL}/auth/login`, TEST_ADMIN);
        adminToken = response.data.accessToken;
        console.log('✅ Login successful\n');
        return true;
    } catch (error) {
        console.error(
            '❌ Login failed:',
            error.response?.data || error.message
        );
        return false;
    }
}

async function testGetShifts() {
    try {
        console.log('📋 Testing GET /api/shifts...');
        const response = await axios.get(`${API_URL}/shifts`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        console.log('✅ Success:', JSON.stringify(response.data, null, 2));
        console.log('');
        return response.data;
    } catch (error) {
        console.error('❌ Failed:', error.response?.data || error.message);
        console.log('');
        return null;
    }
}

async function testCreateShift() {
    try {
        console.log('➕ Testing POST /api/shifts (create shift)...');
        const response = await axios.post(
            `${API_URL}/shifts`,
            {
                name: 'Shift Test',
                start_time: '10:00:00',
                end_time: '18:00:00',
                description: 'Test shift for API testing',
            },
            {
                headers: { Authorization: `Bearer ${adminToken}` },
            }
        );
        console.log('✅ Success:', JSON.stringify(response.data, null, 2));
        console.log('');
        return response.data.data;
    } catch (error) {
        console.error('❌ Failed:', error.response?.data || error.message);
        console.log('');
        return null;
    }
}

async function testUpdateShift(shiftId) {
    try {
        console.log(`✏️ Testing PUT /api/shifts/${shiftId} (update shift)...`);
        const response = await axios.put(
            `${API_URL}/shifts/${shiftId}`,
            {
                description: 'Updated test shift description',
                is_active: true,
            },
            {
                headers: { Authorization: `Bearer ${adminToken}` },
            }
        );
        console.log('✅ Success:', JSON.stringify(response.data, null, 2));
        console.log('');
        return true;
    } catch (error) {
        console.error('❌ Failed:', error.response?.data || error.message);
        console.log('');
        return false;
    }
}

async function testDeleteShift(shiftId) {
    try {
        console.log(
            `🗑️ Testing DELETE /api/shifts/${shiftId} (delete shift)...`
        );
        const response = await axios.delete(`${API_URL}/shifts/${shiftId}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        console.log('✅ Success:', JSON.stringify(response.data, null, 2));
        console.log('');
        return true;
    } catch (error) {
        console.error('❌ Failed:', error.response?.data || error.message);
        console.log('');
        return false;
    }
}

async function testCreateAssignment() {
    try {
        console.log(
            '➕ Testing POST /api/shift-assignments (create assignment)...'
        );
        const response = await axios.post(
            `${API_URL}/shift-assignments`,
            {
                user_id: 1, // Adjust to valid user ID
                shift_id: 1, // Adjust to valid shift ID
                assignment_date: '2025-12-28',
                notes: 'Test assignment',
            },
            {
                headers: { Authorization: `Bearer ${adminToken}` },
            }
        );
        console.log('✅ Success:', JSON.stringify(response.data, null, 2));
        console.log('');
        return response.data.data;
    } catch (error) {
        console.error('❌ Failed:', error.response?.data || error.message);
        console.log('');
        return null;
    }
}

async function testGetCalendar() {
    try {
        console.log('📅 Testing GET /api/shift-assignments/calendar...');
        const response = await axios.get(
            `${API_URL}/shift-assignments/calendar`,
            {
                params: {
                    start_date: '2025-12-01',
                    end_date: '2025-12-31',
                },
                headers: { Authorization: `Bearer ${adminToken}` },
            }
        );
        console.log('✅ Success:', JSON.stringify(response.data, null, 2));
        console.log('');
        return response.data;
    } catch (error) {
        console.error('❌ Failed:', error.response?.data || error.message);
        console.log('');
        return null;
    }
}

async function testBulkCreate() {
    try {
        console.log(
            '➕➕ Testing POST /api/shift-assignments/bulk (bulk create)...'
        );
        const response = await axios.post(
            `${API_URL}/shift-assignments/bulk`,
            {
                assignments: [
                    {
                        user_id: 1,
                        shift_id: 1,
                        assignment_date: '2025-12-29',
                        notes: 'Bulk test 1',
                    },
                    {
                        user_id: 1,
                        shift_id: 2,
                        assignment_date: '2025-12-29',
                        notes: 'Bulk test 2',
                    },
                ],
            },
            {
                headers: { Authorization: `Bearer ${adminToken}` },
            }
        );
        console.log('✅ Success:', JSON.stringify(response.data, null, 2));
        console.log('');
        return response.data;
    } catch (error) {
        console.error('❌ Failed:', error.response?.data || error.message);
        console.log('');
        return null;
    }
}

async function runTests() {
    console.log('🧪 Starting API tests...\n');
    console.log('='.repeat(60));
    console.log('\n');

    // Login first
    const loginSuccess = await login();
    if (!loginSuccess) {
        console.log('❌ Cannot continue without login\n');
        return;
    }

    // Test shifts endpoints
    console.log('📦 TESTING SHIFTS ENDPOINTS');
    console.log('='.repeat(60));
    console.log('');

    await testGetShifts();
    const newShift = await testCreateShift();

    if (newShift) {
        await testUpdateShift(newShift.id);
        await testDeleteShift(newShift.id);
    }

    // Test shift assignments endpoints
    console.log('\n📦 TESTING SHIFT ASSIGNMENTS ENDPOINTS');
    console.log('='.repeat(60));
    console.log('');

    await testCreateAssignment();
    await testGetCalendar();
    await testBulkCreate();

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!\n');
}

runTests().catch(console.error);
