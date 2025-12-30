const puppeteer = require('puppeteer');
const { generateRosterPDFHTML } = require('../templates/roster-pdf.template');

/**
 * PDF Service - Handles PDF generation using Puppeteer
 * @module services/pdf.service
 */
class PDFService {
    /**
     * Generate roster PDF from shift assignments data
     * @param {Object} data - Roster data
     * @param {string} data.month - Month string (e.g., "December 2025")
     * @param {number} data.daysInMonth - Number of days in the month
     * @param {string[]} data.dayNames - Array of day names (S, M, T, etc.)
     * @param {Array} data.users - Array of users with their shifts
     * @returns {Promise<Buffer>} PDF buffer
     */
    async generateRosterPDF(data) {
        let browser = null;

        try {
            console.log('🚀 Starting Puppeteer PDF generation...');

            // Launch browser with optimized settings
            browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                ],
            });

            console.log('✅ Browser launched');
            const page = await browser.newPage();

            // Generate HTML from template
            console.log('📝 Generating HTML template...');
            const htmlContent = generateRosterPDFHTML(data);
            console.log(`✅ HTML generated (${htmlContent.length} chars)`);

            // Set content with proper encoding
            await page.setContent(htmlContent, {
                waitUntil: 'networkidle0',
            });

            console.log('✅ HTML loaded into page');

            // Generate PDF with A4 landscape settings
            console.log('🖨️ Generating PDF...');
            const pdfBuffer = await page.pdf({
                format: 'A4',
                landscape: true,
                printBackground: true,
                margin: {
                    top: '10mm',
                    right: '10mm',
                    bottom: '10mm',
                    left: '10mm',
                },
                preferCSSPageSize: false,
            });

            console.log(`✅ PDF generated: ${pdfBuffer.length} bytes`);

            return pdfBuffer;
        } catch (error) {
            console.error('❌ PDF Generation Error:', error);
            throw new Error(`Failed to generate PDF: ${error.message}`);
        } finally {
            if (browser) {
                console.log('🔒 Closing browser...');
                await browser.close();
            }
        }
    }

    /**
     * Validate roster data before PDF generation
     * @param {Object} data - Data to validate
     * @returns {Object} Validation result
     */
    validateRosterData(data) {
        const errors = [];

        if (!data.month || typeof data.month !== 'string') {
            errors.push('Month is required and must be a string');
        }

        if (!data.daysInMonth || typeof data.daysInMonth !== 'number') {
            errors.push('Days in month is required and must be a number');
        }

        if (!Array.isArray(data.dayNames) || data.dayNames.length === 0) {
            errors.push('Day names must be a non-empty array');
        }

        if (!Array.isArray(data.users) || data.users.length === 0) {
            errors.push('Users must be a non-empty array');
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }
}

module.exports = new PDFService();
