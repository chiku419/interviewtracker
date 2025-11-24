const { fetchSheetByName } = require('./utils/sheetsFetcher');

const PLACEMENT_SHEET_ID = '1P6G0Ov1qG63WuDgvne2N582WL_C9DMI_RFUDA9Y1NOc';

async function inspectSheet() {
    try {
        console.log('Fetching Expected sheet...');
        const data = await fetchSheetByName('Expected', PLACEMENT_SHEET_ID);
        if (data.length > 0) {
            console.log('Columns:', Object.keys(data[0]));
            console.log('First 3 rows:', data.slice(0, 3));
        } else {
            console.log('Sheet is empty');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

inspectSheet();
