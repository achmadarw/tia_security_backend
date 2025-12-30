/**
 * Generate HTML template for Roster PDF - Match Calendar View Design
 * @param {Object} data - Roster data
 * @returns {string} HTML string
 */
function generateRosterPDFHTML(data) {
    const { month, daysInMonth, dayNames, users } = data;

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
        });
    }

    // Shift colors matching calendar view UI
    const shiftColors = {
        1: { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' }, // Yellow - Pagi
        2: { bg: '#CFFAFE', border: '#67E8F9', text: '#164E63' }, // Cyan - Siang
        3: { bg: '#D1FAE5', border: '#6EE7B7', text: '#065F46' }, // Green - Malam
        O: { bg: '#F3F4F6', border: '#D1D5DB', text: '#6B7280' }, // Gray - OFF
    };

    // Build calendar header with dates and days
    let calendarHeader = '<div class="calendar-header">';

    // Personnel column header
    calendarHeader +=
        '<div class="header-cell personnel-header">Personnel</div>';

    // Date columns
    for (let day = 1; day <= daysInMonth; day++) {
        const dayName = dayNames[day - 1];
        const isWeekend = dayName === 'S' || dayName === 'M';
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

            const dayName = dayNames[dayIndex];
            const isWeekend = dayName === 'S' || dayName === 'M';

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
            padding: 16px;
            background: #F9FAFB;
            color: #111827;
        }
        
        .container {
            max-width: 100%;
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 2px solid #E5E7EB;
        }
        
        .header h3 {
            margin: 2px 0;
            font-size: 9pt;
            font-weight: 500;
            color: #6B7280;
            line-height: 1.4;
        }
        
        .header h2 {
            margin: 12px 0 0 0;
            font-size: 16pt;
            font-weight: 700;
            color: #111827;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .calendar-container {
            overflow-x: auto;
            margin-bottom: 16px;
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
            background: #F9FAFB;
            border: 1px solid #E5E7EB;
            font-size: 8pt;
        }
        
        .personnel-header {
            width: 95px;
            min-width: 95px;
            font-weight: 600;
            color: #374151;
            background: #F3F4F6;
            font-size: 8pt;
        }
        
        .date-cell {
            width: 30px;
            min-width: 30px;
            flex-shrink: 0;
            gap: 2px;
        }
        
        .date-cell.weekend {
            background: #FEF3C7;
        }
        
        .date-number {
            font-weight: 700;
            font-size: 9pt;
            color: #111827;
        }
        
        .day-name {
            font-size: 6.5pt;
            color: #6B7280;
            font-weight: 500;
        }
        
        .personnel-row {
            display: flex;
            gap: 0;
            margin-bottom: 2px;
        }
        
        .personnel-cell {
            width: 95px;
            min-width: 95px;
            padding: 7px 6px;
            background: #F9FAFB;
            border: 1px solid #E5E7EB;
            font-weight: 600;
            font-size: 8pt;
            color: #111827;
            display: flex;
            align-items: center;
        }
        
        .shift-cell {
            width: 30px;
            min-width: 30px;
            flex-shrink: 0;
            padding: 3px;
            background: white;
            border: 1px solid #E5E7EB;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .shift-cell.weekend {
            background: #FFFBEB;
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
            padding: 12px;
            background: #F9FAFB;
            border-radius: 6px;
            margin-bottom: 16px;
            flex-wrap: wrap;
        }
        
        .stat-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 8pt;
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
            padding: 12px;
            background: #F9FAFB;
            border-radius: 6px;
            flex-wrap: wrap;
            align-items: center;
        }
        
        .legend-label {
            font-size: 8pt;
            font-weight: 600;
            color: #6B7280;
            margin-right: 4px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 7pt;
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
            <h3>KABUPATEN BOGOR</h3>
            <h3>KECAMATAN CIBINONG KELURAHAN KARADENAN</h3>
            <h3>PAGUYUBAN THE ICON ACROPOLIS RT010/RW018</h3>
            <h2>${month}</h2>
        </div>
        
        <div class="stats">
            <div class="stat-item">
                <span class="stat-label">Assigned:</span>
                <span class="stat-value">${users.length}/${users.length}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">●</span>
                <span class="stat-label">Pagi:</span>
                <span class="stat-value">${pagiCount}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">●</span>
                <span class="stat-label">Siang:</span>
                <span class="stat-value">${siangCount}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">●</span>
                <span class="stat-label">Malam:</span>
                <span class="stat-value">${malamCount}</span>
            </div>
        </div>
        
        <div class="calendar-container">
            ${calendarHeader}
            ${personnelRows}
        </div>
        
        <div class="legend">
            <span class="legend-label">Legend:</span>
            <div class="legend-item off">OFF</div>
            <div class="legend-item pagi">Pagi</div>
            <div class="legend-item siang">Siang</div>
            <div class="legend-item malam">Malam</div>
        </div>
    </div>
</body>
</html>`;
}

module.exports = {
    generateRosterPDFHTML,
};
