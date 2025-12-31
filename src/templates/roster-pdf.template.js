const fs = require('fs');
const path = require('path');

/**
 * Convert image file to base64 data URL
 * @param {string} filePath - Path to image file
 * @returns {string} Base64 data URL
 */
function imageToBase64(filePath) {
    try {
        const imageBuffer = fs.readFileSync(filePath);
        const base64 = imageBuffer.toString('base64');
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        console.error('Error loading image:', filePath, error);
        return '';
    }
}

/**
 * Generate HTML template for Roster PDF - Match Calendar View Design
 * @param {Object} data - Roster data
 * @returns {string} HTML string
 */
function generateRosterPDFHTML(data) {
    const { month, daysInMonth, dayNames, users, shifts } = data;

    // Load logos as base64
    const logoPath = path.join(__dirname, '../../uploads/logos');
    const tegarBerimanLogo = imageToBase64(
        path.join(logoPath, 'tegar_beriman.png')
    );
    const satpamLogo = imageToBase64(path.join(logoPath, 'satpam.png'));
    const iconAcropolisLogo = imageToBase64(
        path.join(logoPath, 'the_icon_acropolis.png')
    );

    console.log('🖼️ Logos loaded:', {
        tegarBerimanLogoLength: tegarBerimanLogo.length,
        satpamLogoLength: satpamLogo.length,
        iconAcropolisLogoLength: iconAcropolisLogo.length,
        tegarBerimanPreview: tegarBerimanLogo.substring(0, 50),
        satpamPreview: satpamLogo.substring(0, 50),
    });

    console.log('📝 Template received data:', {
        month,
        daysInMonth,
        dayNamesCount: dayNames?.length,
        usersCount: users?.length,
    });

    if (users && users.length > 0) {
        console.log('First user in template:', {
            name: users[0].name,
            shiftsCount: users[0].shifts?.length,
            sampleShifts: users[0].shifts?.slice(0, 5),
            last5Shifts: users[0].shifts?.slice(-5),
        });
        console.log(
            'All days in first user shifts:',
            users[0].shifts?.map(
                (s, i) => `Day ${i + 1}: ${s.shiftCode || 'empty'}`
            )
        );
    }

    // Shift colors matching calendar view UI
    const shiftColors = {
        1: { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' }, // Yellow - Pagi
        2: { bg: '#CFFAFE', border: '#67E8F9', text: '#164E63' }, // Cyan - Siang
        3: { bg: '#D1FAE5', border: '#6EE7B7', text: '#065F46' }, // Green - Malam
        O: { bg: '#F3F4F6', border: '#D1D5DB', text: '#6B7280' }, // Light Gray - OFF
    };

    // Parse year and month from month string (e.g., "December 2025")
    const monthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];
    const [monthName, yearStr] = month.split(' ');
    const year = parseInt(yearStr);
    // Case-insensitive lookup
    const monthIndex = monthNames.findIndex(
        (m) => m.toLowerCase() === monthName.toLowerCase()
    );

    console.log('📅 Parsed date:', { month, monthName, year, monthIndex });

    // Debug: Check actual weekends for this month
    console.log('🔍 Weekend check for first week:');
    for (let d = 1; d <= 7; d++) {
        const testDate = new Date(year, monthIndex, d);
        const dow = testDate.getDay();
        console.log(
            `  Day ${d}: getDay()=${dow} (0=Sun,6=Sat) → ${
                dow === 0 || dow === 6 ? 'WEEKEND' : 'weekday'
            }`
        );
    }

    // Build calendar header with dates and days
    let calendarHeader = '<div class="calendar-header">';

    // Personnel column header
    calendarHeader +=
        '<div class="header-cell personnel-header">Personnel</div>';

    // Date columns
    for (let day = 1; day <= daysInMonth; day++) {
        const dayName = dayNames[day - 1];
        // Check actual day of week: 0=Sunday, 6=Saturday
        const date = new Date(year, monthIndex, day);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

        calendarHeader += `
            <div class="header-cell date-cell ${isWeekend ? 'weekend' : ''}">
                <div class="date-number">${day}</div>
                <div class="day-name">${dayName}</div>
            </div>`;
    }
    calendarHeader += '</div>';

    // Build personnel rows
    let personnelRows = '';
    users.forEach((user) => {
        personnelRows += '<div class="personnel-row">';

        // Personnel name
        personnelRows += `<div class="personnel-cell">${user.name}</div>`;

        // Shift boxes
        user.shifts.forEach((shift, dayIndex) => {
            const shiftCode = shift.shiftCode || shift.code || '';
            const isOff =
                shift.isOff ||
                shiftCode === 'O' ||
                shiftCode === 'o' ||
                shiftCode === 0 ||
                shiftCode === '0';

            const code = isOff ? 'O' : shiftCode;
            const colors = shiftColors[code] || {
                bg: '#FFFFFF',
                border: '#E5E7EB',
                text: '#9CA3AF',
            };

            // Check actual day of week for weekend highlight
            const day = dayIndex + 1;
            const date = new Date(year, monthIndex, day);
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

            if (code) {
                personnelRows += `
                    <div class="shift-cell ${isWeekend ? 'weekend' : ''}">
                        <div class="shift-box" style="
                            background-color: ${colors.bg};
                            border-color: ${colors.border};
                            color: ${colors.text};
                        ">${code}</div>
                    </div>`;
            } else {
                personnelRows += `<div class="shift-cell ${
                    isWeekend ? 'weekend' : ''
                }"></div>`;
            }
        });

        personnelRows += '</div>';
    });

    // Generate signature names from users
    let signatureNames = '';
    users.forEach((user) => {
        signatureNames += `
                <div class="signature-name">
                    <div class="signature-box">${user.name}</div>
                </div>`;
    });

    // Generate schedule info from shifts data
    let scheduleInfo = '';

    // Helper function to format time with Indonesian time of day
    function formatTimeIndonesian(timeStr) {
        const [hour, minute] = timeStr.split(':').map(Number);
        let hourDisplay = hour;
        let timeOfDay = '';

        // Special case for midnight (00:00)
        if (hour === 0 && minute === 0) {
            return '12 malam';
        }

        // Determine time of day
        if (hour >= 0 && hour < 6) {
            timeOfDay = 'dini hari';
        } else if (hour >= 6 && hour < 11) {
            timeOfDay = 'pagi';
        } else if (hour >= 11 && hour < 15) {
            timeOfDay = 'siang';
        } else if (hour >= 15 && hour < 18) {
            timeOfDay = 'sore';
        } else {
            timeOfDay = 'malam';
        }

        return `${hourDisplay} ${timeOfDay}`;
    }

    if (shifts && shifts.length > 0) {
        shifts.forEach((shift, index) => {
            const shiftCode = index + 1; // Code is 1-based
            const startTime = shift.start_time.substring(0, 5); // HH:MM
            const endTime = shift.end_time.substring(0, 5); // HH:MM

            const startFormatted = formatTimeIndonesian(startTime);
            const endFormatted = formatTimeIndonesian(endTime);

            scheduleInfo += `<div>${shiftCode} – dari jam ${startFormatted} sampai ${endFormatted}</div>`;
        });
        scheduleInfo += '<div>O – Off</div>';
    } else {
        // Fallback if no shifts data
        scheduleInfo = `
            <div>1 – dari jam 7 pagi sampai 4 sore</div>
            <div>2 – dari jam 3 sore sampai 12 malam</div>
            <div>3 - dari jam 11 malam sampai 7 pagi</div>
            <div>O – Off</div>
        `;
    }

    // Calculate statistics
    let pagiCount = 0,
        siangCount = 0,
        malamCount = 0,
        offCount = 0;
    users.forEach((user) => {
        user.shifts.forEach((shift) => {
            const code = shift.shiftCode || shift.code || '';
            if (code === '1') pagiCount++;
            else if (code === '2') siangCount++;
            else if (code === '3') malamCount++;
            else if (code === 'O' || code === 'o' || code === 0 || code === '0')
                offCount++;
        });
    });

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Roster ${month}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            margin: 0;
            padding: 8px;
            background: #F9FAFB;
            color: #000000;
            height: 100vh;
            width: 100vw;
        }
        
        .container {
            width: 100%;
            height: 100%;
            background: white;
            border-radius: 8px;
            padding: 1px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            text-align: center;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            margin-bottom: 12px;
            margin-top: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #E5E7EB;
            flex-shrink: 0;
        }
        
        .header-logo {
            width: 150px;
            height: 150px;
            object-fit: contain;
            flex-shrink: 0;
        }
        
        .header-logo:first-child {
            margin-left: 50px;
        }
        
        .header-logo:last-child {
            margin-right: 50px;
        }
        
        .header-text {
            flex: 1;
            text-align: center;
        }
        
        .header-text h3 {
            margin: 1px 0;
            font-size: 15pt;
            font-weight: 600;
            color: #000000;
            line-height: 1.3;
        }
        
        .header-text h2 {
            margin: 25px 0 0 0;
            font-size: 16pt;
            font-weight: 700;
            color: #000000;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .content-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            flex: 1;
            padding: 0;
        }
        
        .calendar-container {
            overflow-x: auto;
            margin-bottom: 16px;
            display: inline-block;
            border: 1px solid #E5E7EB;
        }
        
        .calendar-header {
            display: flex;
            gap: 0;
            margin-bottom: 2px;
        }
        
        .header-cell {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 8px 3px;
            background: #F3F4F6;
            border-right: 1px solid #E5E7EB;
            border-bottom: 1px solid #E5E7EB;
            font-size: 8pt;
        }
        
        .header-cell:last-child {
            border-right: none;
        }
        
        .personnel-header {
            width: 90px;
            min-width: 90px;
            font-weight: 600;
            color: #374151;
            font-size: 8pt;
        }
        
        .date-cell {
            width: 29px;
            min-width: 29px;
            flex-shrink: 0;
            gap: 2px;
        }
        
        .date-cell.weekend {
            background: #FEE2E2;
        }
        
        .date-number {
            font-weight: 700;
            font-size: 9pt;
            color: #374151;
        }
        
        .day-name {
            font-size: 6.5pt;
            color: #6B7280;
            font-weight: 600;
        }
        
        .personnel-row {
            display: flex;
            gap: 0;
            margin-bottom: 2px;
        }
        
        .personnel-cell {
            width: 90px;
            min-width: 90px;
            padding: 7px 6px;
            border-right: 1px solid #E5E7EB;
            border-bottom: 1px solid #E5E7EB;
            font-weight: 600;
            font-size: 8pt;
            color: #111827;
            display: flex;
            align-items: center;
        }
        
        .shift-cell {
            width: 29px;
            min-width: 29px;
            flex-shrink: 0;
            padding: 3px;
            border-right: 1px solid #E5E7EB;
            border-bottom: 1px solid #E5E7EB;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .shift-cell:last-child {
            border-right: none;
        }
        
        .shift-cell.weekend {
            background: #FEE2E2;
        }
        
        .shift-box {
            width: 26px;
            height: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            border: 1.5px solid;
            font-weight: 700;
            font-size: 10pt;
        }
        
        .stats {
            display: flex;
            gap: 16px;
            padding: 6px;
            background: #F9FAFB;
            border-radius: 6px;
            margin-bottom: 8px;
            flex-wrap: wrap;
        }
        
        .stat-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 7pt;
        }
        
        .stat-label {
            color: #6B7280;
            font-weight: 500;
        }
        
        .stat-value {
            font-weight: 700;
            color: #111827;
        }
        
        .legend {
            display: flex;
            gap: 12px;
            padding: 8px;
            background: #F9FAFB;
            border-radius: 6px;
            flex-wrap: wrap;
            align-items: center;
        }
        
        .legend-label {
            font-size: 7pt;
            font-weight: 600;
            color: #6B7280;
            margin-right: 4px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 6.5pt;
            font-weight: 600;
            border: 1.5px solid;
        }
        
        .legend-item.pagi {
            background: #FEF3C7;
            border-color: #FCD34D;
            color: #92400E;
        }
        
        .legend-item.siang {
            background: #CFFAFE;
            border-color: #67E8F9;
            color: #164E63;
        }
        
        .legend-item.malam {
            background: #D1FAE5;
            border-color: #6EE7B7;
            color: #065F46;
        }
        
        .legend-item.off {
            background: #F3F4F6;
            border-color: #D1D5DB;
            color: #6B7280;
        }
        
        .signature-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 15px;
            margin-left: 10px;
            margin-right: 10px;
            align-self: stretch;
            flex: 1;
        }
        
        .signature-left {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px 20px;
            align-self: stretch;
            padding: 15px;
        }
        
        .signature-name {
            text-align: center;
            font-size: 8pt;
            font-weight: 600;
            color: #000;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            min-height: 50px;
        }
        
        .signature-box {
            border-top: 1px solid #000;
            background: #fff;
        }
        
        .signature-center {
            flex: 1;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .center-logo {
            width: 200px;
            height: 200px;
            object-fit: contain;
        }
        
        .signature-right {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 200px;
            align-self: stretch;
            padding: 15px;
        }
        
        .schedule-info {
            font-size: 8pt;
            color: #000;
            line-height: 1.5;
            text-align: left;
        }
        
        .schedule-title {
            font-weight: 700;
            margin-bottom: 3px;
        }
        
        .coordinator-section {
            margin-top: auto;
            text-align: center;
        }
        
        .coordinator-title {
            font-size: 8pt;
            font-weight: 600;
            color: #000;
            border-top: 1px solid #000;
            display: inline-block;
            text-align: center;
        }
        
        @media print {
            body {
                padding: 8px;
            }
            .container {
                box-shadow: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            ${
                tegarBerimanLogo
                    ? `<img src="${tegarBerimanLogo}" alt="Tegar Beriman Logo" class="header-logo" />`
                    : '<div class="header-logo"></div>'
            }
            <div class="header-text">
                <h3>KABUPATEN BOGOR</h3>
                <h3>KECAMATAN CIBINONG KELURAHAN KARADENAN</h3>
                <h3>PAGUYUBAN THE ICON ACROPOLIS RT010/RW018</h3>
                <h2>${month}</h2>
            </div>
            ${
                satpamLogo
                    ? `<img src="${satpamLogo}" alt="Satpam Logo" class="header-logo" />`
                    : '<div class="header-logo"></div>'
            }
        </div>
        
        <div class="content-wrapper">
            <div class="calendar-container">
                ${calendarHeader}
                ${personnelRows}
            </div>
            
            <div class="signature-section">
            <div class="signature-left">
                ${signatureNames}
            </div>
            
            <div class="signature-center">
                ${
                    iconAcropolisLogo
                        ? `<img src="${iconAcropolisLogo}" alt="The Icon Acropolis Logo" class="center-logo" />`
                        : ''
                }
            </div>
            
            <div class="signature-right">
                <div class="schedule-info">
                    <div class="schedule-title">Jadwal jam kerja:-</div>
                    ${scheduleInfo}
                </div>
                <div class="coordinator-section">
                    <div class="coordinator-title">ABDULLAH MAS'AID / OKI WIJAYA<br/>KETUA PAGUYUBAN / KOORDINATOR KEAMANAN</div>
                </div>
            </div>
        </div>
        </div>
    </div>
</body>
</html>`;
}

module.exports = {
    generateRosterPDFHTML,
};
