import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Enable console logging
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  try {
    console.log('Navigating to http://localhost:8082...');
    await page.goto('http://localhost:8082', { waitUntil: 'networkidle2', timeout: 30000 });
    
    console.log('Page loaded, waiting for React to mount...');
    await page.waitForTimeout(5000);
    
    // Check if React root exists
    const rootExists = await page.$('#root');
    console.log('React root exists:', !!rootExists);
    
    // Get page title
    const title = await page.title();
    console.log('Page title:', title);
    
    // Get body text
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('Body text length:', bodyText.length);
    console.log('Body text preview:', bodyText.substring(0, 200));
    
    // Check for FaceAttend text
    const faceAttendExists = await page.evaluate(() => {
      return document.body.innerText.includes('FaceAttend');
    });
    console.log('FaceAttend text found:', faceAttendExists);
    
    // Check for Sign In/Sign Up
    const authExists = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Sign In') || text.includes('Sign Up');
    });
    console.log('Auth elements found:', authExists);
    
    // Take screenshot
    await page.screenshot({ path: '/app/test_screenshot.png' });
    console.log('Screenshot saved to /app/test_screenshot.png');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();