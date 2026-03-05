'use strict';

// Stock universe — ~490 stocks across 12 sectors
function screenStocks() {
    const stockLists = {
        techAI: ['NVDA', 'AVGO', 'GOOGL', 'MSFT', 'META', 'ORCL', 'CRM', 'ADBE', 'NOW', 'INTU',
                 'PLTR', 'SNOW', 'AI', 'BBAI', 'SOUN', 'PATH', 'S', 'HUBS', 'ZM', 'DOCU',
                 'TEAM', 'WDAY', 'VEEV', 'ESTC', 'DDOG', 'NET', 'MDB', 'CRWD', 'PANW', 'ZS',
                 'OKTA', 'CFLT', 'GTLB', 'FROG', 'BILL', 'DOCN', 'GTM', 'MNDY', 'PCOR', 'APP'],

        techHardware: ['AAPL', 'QCOM', 'INTC', 'MU', 'ARM', 'DELL', 'HPQ', 'AMAT', 'LRCX', 'MRVL',
                       'AMD', 'TXN', 'ADI', 'NXPI', 'KLAC', 'ASML', 'TSM', 'SNPS', 'CDNS', 'ON',
                       'MPWR', 'SWKS', 'QRVO', 'ENTG', 'FORM', 'MKSI', 'COHR', 'IPGP', 'LITE', 'AMBA',
                       'SLAB', 'CRUS', 'SYNA', 'MCHP', 'SMCI', 'WDC', 'STX', 'PSTG', 'NTAP', 'CHKP',
                       'IONQ', 'RGTI', 'QBTS', 'QUBT', 'ARQQ', 'IBM',
                       'WOLF', 'OUST',
                       'IMOS', 'VECO', 'POWI', 'PLXS', 'VICR'],

        evAuto: ['TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'F', 'GM', 'STLA', 'TM',
                 'HMC', 'RACE', 'VWAGY', 'PSNY', 'NSANY', 'APTV', 'MBGYY', 'POAHY', 'FUJHY', 'ALV',
                 'WKHS', 'BLNK', 'CHPT', 'EVGO', 'PAG', 'QS',
                 'HYLN', 'JZXN', 'VRM', 'CVNA', 'KMX', 'AN', 'LAD'],

        finance: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'V', 'MA',
                  'XYZ', 'PYPL', 'GPN', 'AXP', 'FIS', 'COF', 'ALLY', 'USB', 'PNC', 'TFC', 'RF',
                  'KEY', 'FITB', 'MTB', 'CFG', 'HBAN', 'STT', 'BK', 'NTRS',
                  'ZION', 'FHN', 'WRB', 'CB', 'TRV', 'ALL', 'PGR', 'AIG', 'MET', 'PRU'],

        growth: ['DKNG', 'RBLX', 'U', 'PINS', 'SNAP', 'SPOT', 'ABNB', 'LYFT', 'DASH', 'UBER',
                 'CPNG', 'BKNG', 'EXPE', 'TCOM', 'TRIP', 'PTON', 'LULU', 'ETSY', 'W', 'CHWY',
                 'COIN', 'OPEN', 'COMP', 'RKT', 'CWAN', 'DUOL', 'BROS', 'CAVA', 'HOOD', 'AFRM',
                 'UPST', 'LC', 'NU', 'SOFI', 'NFLX', 'ROKU', 'WBD', 'FOXA', 'CMCSA', 'T'],

        healthcare: ['JNJ', 'UNH', 'LLY', 'ABBV', 'PFE', 'MRNA', 'VRTX', 'REGN', 'BMY', 'GILD',
                     'AMGN', 'CVS', 'CI', 'HUM', 'ISRG', 'TMO', 'DHR', 'ABT', 'SYK', 'BSX',
                     'MDT', 'BDX', 'BAX', 'ZBH', 'HCA', 'DVA', 'EXAS', 'ILMN',
                     'BIIB', 'ALNY', 'INCY', 'NBIX', 'UTHR', 'JAZZ', 'SRPT', 'BMRN', 'IONS', 'RGEN'],

        consumer: ['AMZN', 'WMT', 'COST', 'TGT', 'HD', 'LOW', 'SBUX', 'MCD', 'CMG', 'YUM',
                   'NKE', 'RH', 'DECK', 'CROX', 'ULTA', 'ELF', 'LEVI', 'UAA', 'DIS', 'GOOG',
                   'KO', 'PEP', 'PM', 'MO', 'BUD', 'TAP', 'STZ', 'MNST', 'CELH', 'KDP',
                   'ORLY', 'AZO', 'AAP', 'GPC', 'TSCO', 'DG', 'DLTR', 'ROST', 'TJX', 'BBY'],

        energy: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'MPC', 'PSX', 'VLO', 'TRGP',
                 'DVN', 'FANG', 'WMB', 'APA', 'HAL', 'BKR', 'NOV', 'FTI', 'NEE', 'DUK',
                 'SO', 'D', 'AEP', 'EXC', 'ENPH', 'SEDG', 'RUN', 'FSLR', 'PLUG',
                 'PBF', 'DK', 'CTRA', 'OVV', 'PR', 'SM', 'MGY', 'MTDR', 'CHRD', 'OKE',
                 'SMR', 'VST', 'CEG', 'CCJ', 'LNG', 'AR', 'GEV'],

        industrials: ['CAT', 'DE', 'CMI', 'EMR', 'ETN', 'PH', 'ROK', 'AME', 'DOV', 'ITW',
                      'GE', 'HON', 'MMM', 'DHI', 'LEN', 'NVR', 'PHM', 'TOL', 'BLD', 'BLDR',
                      'UNP', 'NSC', 'CSX', 'UPS', 'FDX', 'CHRW', 'JBHT', 'KNX', 'ODFL', 'XPO',
                      'CARR', 'VLTO', 'IR', 'WM', 'RSG', 'PCAR', 'PWR', 'JCI', 'AOS', 'ROP',
                      'ROCK', 'MLI', 'RUSHA', 'MYRG', 'DY', 'APOG'],

        realEstate: ['AMT', 'PLD', 'CCI', 'EQIX', 'PSA', 'DLR', 'WELL', 'O', 'VICI', 'SPG',
                     'AVB', 'EQR', 'MAA', 'UDR', 'CPT', 'ESS', 'ELS', 'SUI', 'NXRT',
                     'VTR', 'STWD', 'DOC', 'OHI', 'SBRA', 'LTC', 'HR', 'MPT', 'NHI', 'CTRE',
                     'IRM', 'CUBE', 'NSA', 'REXR', 'TRNO', 'SELF', 'SAFE'],

        materials: ['NEM', 'FCX', 'GOLD', 'AU', 'AEM', 'WPM', 'FNV', 'RGLD', 'KGC', 'HL',
                    'NUE', 'STLD', 'RS', 'CLF', 'AA', 'MT', 'TX', 'CMC', 'NB', 'ATI',
                    'DOW', 'LYB', 'EMN', 'CE', 'APD', 'LIN', 'ECL', 'ALB', 'SQM', 'LAC',
                    'MP', 'DD', 'PPG', 'SHW', 'RPM', 'AXTA', 'FUL', 'NEU', 'USAR', 'UUUU',
                    'B'],

        defense: ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'LHX', 'HII', 'TXT', 'HWM', 'AXON',
                  'KTOS', 'AVAV', 'AIR', 'SAIC', 'LDOS', 'CACI', 'BAH', 'BWXT', 'WWD', 'MOG.A',
                  'TDG', 'HEI', 'CW', 'AIN', 'PSN', 'MRCY', 'DRS']
    };

    const allStocks = [];
    for (const stocks of Object.values(stockLists)) {
        allStocks.push(...stocks);
    }
    return [...new Set(allStocks)];
}

module.exports = { screenStocks };
