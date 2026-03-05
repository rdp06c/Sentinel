'use strict';

// === Stock Universe: Ticker → Company Name ===
const stockNames = {
    // Tech - AI/Software
    'NVDA': 'NVIDIA', 'AMD': 'Advanced Micro Devices', 'GOOGL': 'Alphabet (Google)', 'GOOG': 'Alphabet (Google)',
    'META': 'Meta Platforms', 'PLTR': 'Palantir', 'SNOW': 'Snowflake', 'MSFT': 'Microsoft',
    'ORCL': 'Oracle', 'CRM': 'Salesforce', 'ADBE': 'Adobe', 'NOW': 'ServiceNow',
    'AI': 'C3.ai', 'BBAI': 'BigBear.ai', 'SOUN': 'SoundHound AI', 'PATH': 'UiPath',
    'S': 'SentinelOne', 'HUBS': 'HubSpot', 'ZM': 'Zoom', 'DOCU': 'DocuSign',
    'TEAM': 'Atlassian', 'WDAY': 'Workday', 'VEEV': 'Veeva', 'ESTC': 'Elastic',
    'DDOG': 'Datadog', 'NET': 'Cloudflare', 'MDB': 'MongoDB', 'CRWD': 'CrowdStrike',
    'PANW': 'Palo Alto Networks', 'ZS': 'Zscaler', 'OKTA': 'Okta', 'CFLT': 'Confluent',
    'GTLB': 'GitLab', 'FROG': 'JFrog', 'BILL': 'Bill Holdings', 'DOCN': 'DigitalOcean',
    'GTM': 'ZoomInfo', 'MNDY': 'monday.com', 'PCOR': 'Procore', 'APP': 'AppLovin',
    'INTU': 'Intuit',

    // Tech - Hardware/Semiconductors
    'AAPL': 'Apple', 'QCOM': 'Qualcomm', 'INTC': 'Intel', 'MU': 'Micron Technology',
    'ARM': 'Arm Holdings', 'AVGO': 'Broadcom', 'TXN': 'Texas Instruments', 'ADI': 'Analog Devices',
    'NXPI': 'NXP Semiconductors', 'KLAC': 'KLA Corporation', 'ASML': 'ASML Holding', 'TSM': 'Taiwan Semiconductor',
    'SNPS': 'Synopsys', 'CDNS': 'Cadence Design', 'ON': 'ON Semiconductor', 'MPWR': 'Monolithic Power',
    'SWKS': 'Skyworks Solutions', 'QRVO': 'Qorvo', 'DELL': 'Dell Technologies', 'HPQ': 'HP Inc.',
    'AMAT': 'Applied Materials', 'LRCX': 'Lam Research', 'MRVL': 'Marvell Technology', 'SMCI': 'Super Micro Computer',
    'ENTG': 'Entegris', 'FORM': 'FormFactor', 'MKSI': 'MKS Instruments', 'COHR': 'Coherent',
    'IPGP': 'IPG Photonics', 'LITE': 'Lumentum', 'AMBA': 'Ambarella', 'SLAB': 'Silicon Labs',
    'CRUS': 'Cirrus Logic', 'SYNA': 'Synaptics', 'MCHP': 'Microchip Technology',
    'WDC': 'Western Digital', 'STX': 'Seagate', 'PSTG': 'Pure Storage', 'NTAP': 'NetApp', 'CHKP': 'Check Point',
    'IONQ': 'IonQ', 'RGTI': 'Rigetti Computing', 'QBTS': 'D-Wave Quantum', 'QUBT': 'Quantum Computing',
    'ARQQ': 'Arqit Quantum', 'IBM': 'IBM',
    'WOLF': 'Wolfspeed', 'OUST': 'Ouster',
    'IMOS': 'ChipMOS Technologies', 'VECO': 'Veeco Instruments', 'POWI': 'Power Integrations',
    'PLXS': 'Plexus Corp.', 'VICR': 'Vicor Corporation',

    // EV/Automotive
    'TSLA': 'Tesla', 'RIVN': 'Rivian', 'LCID': 'Lucid Group', 'NIO': 'NIO Inc.',
    'XPEV': 'XPeng', 'LI': 'Li Auto', 'F': 'Ford', 'GM': 'General Motors',
    'STLA': 'Stellantis', 'TM': 'Toyota', 'HMC': 'Honda', 'RACE': 'Ferrari',
    'VWAGY': 'Volkswagen', 'PSNY': 'Polestar', 'NSANY': 'Nissan', 'MBGYY': 'Mercedes-Benz',
    'POAHY': 'Porsche', 'FUJHY': 'Subaru', 'BLNK': 'Blink Charging', 'CHPT': 'ChargePoint',
    'EVGO': 'EVgo', 'PAG': 'Penske Auto',
    'QS': 'QuantumScape', 'WKHS': 'Workhorse', 'ALV': 'Autoliv',
    'HYLN': 'Hyliion', 'JZXN': 'Jiuzi Holdings', 'VRM': 'Vroom',
    'CVNA': 'Carvana', 'KMX': 'CarMax', 'APTV': 'Aptiv',
    'AN': 'AutoNation', 'LAD': 'Lithia Motors',

    // Finance
    'JPM': 'JPMorgan Chase', 'BAC': 'Bank of America', 'V': 'Visa', 'MA': 'Mastercard',
    'COIN': 'Coinbase', 'SOFI': 'SoFi', 'PYPL': 'PayPal', 'XYZ': 'Block',
    'WFC': 'Wells Fargo', 'GS': 'Goldman Sachs', 'MS': 'Morgan Stanley', 'C': 'Citigroup',
    'BLK': 'BlackRock', 'SCHW': 'Charles Schwab', 'AFRM': 'Affirm', 'UPST': 'Upstart',
    'NU': 'Nu Holdings', 'MELI': 'MercadoLibre', 'HOOD': 'Robinhood',
    'GPN': 'Global Payments', 'LC': 'LendingClub', 'AXP': 'American Express',
    'FIS': 'Fidelity National', 'COF': 'Capital One', 'ALLY': 'Ally Financial',
    'USB': 'U.S. Bancorp', 'PNC': 'PNC Financial', 'TFC': 'Truist Financial',
    'RF': 'Regions Financial', 'KEY': 'KeyCorp', 'FITB': 'Fifth Third', 'CFG': 'Citizens Financial',
    'HBAN': 'Huntington Bancshares', 'MTB': 'M&T Bank', 'STT': 'State Street', 'BK': 'BNY Mellon',
    'NTRS': 'Northern Trust', 'ZION': 'Zions Bancorp', 'FHN': 'First Horizon',
    'WRB': 'Berkley', 'CB': 'Chubb', 'TRV': 'Travelers', 'ALL': 'Allstate',
    'PGR': 'Progressive', 'AIG': 'AIG', 'MET': 'MetLife', 'PRU': 'Prudential',
    'RKT': 'Rocket Companies',

    // Growth
    'DKNG': 'DraftKings', 'RBLX': 'Roblox', 'U': 'Unity Software', 'PINS': 'Pinterest',
    'SNAP': 'Snap Inc.', 'SPOT': 'Spotify', 'ROKU': 'Roku', 'ABNB': 'Airbnb',
    'LYFT': 'Lyft', 'DASH': 'DoorDash', 'UBER': 'Uber', 'SHOP': 'Shopify',
    'SE': 'Sea Limited', 'BABA': 'Alibaba', 'JD': 'JD.com', 'PDD': 'PDD Holdings',
    'CPNG': 'Coupang', 'BKNG': 'Booking Holdings', 'EXPE': 'Expedia', 'TCOM': 'Trip.com',
    'TRIP': 'TripAdvisor', 'PTON': 'Peloton', 'OPEN': 'Opendoor', 'COMP': 'Compass International',
    'CWAN': 'Clearwater Analytics', 'DUOL': 'Duolingo', 'BROS': 'Dutch Bros', 'CAVA': 'CAVA Group',

    // Healthcare
    'JNJ': 'Johnson & Johnson', 'UNH': 'UnitedHealth', 'LLY': 'Eli Lilly', 'PFE': 'Pfizer',
    'MRNA': 'Moderna', 'ABBV': 'AbbVie', 'VRTX': 'Vertex Pharma', 'REGN': 'Regeneron',
    'BMY': 'Bristol Myers Squibb', 'GILD': 'Gilead Sciences', 'AMGN': 'Amgen', 'CVS': 'CVS Health',
    'ISRG': 'Intuitive Surgical', 'TMO': 'Thermo Fisher', 'DHR': 'Danaher', 'ABT': 'Abbott Labs',
    'CI': 'The Cigna Group', 'HUM': 'Humana', 'SYK': 'Stryker', 'BSX': 'Boston Scientific',
    'MDT': 'Medtronic', 'BDX': 'Becton Dickinson', 'BAX': 'Baxter', 'ZBH': 'Zimmer Biomet',
    'HCA': 'HCA Healthcare', 'DVA': 'DaVita',
    'EXAS': 'Exact Sciences', 'ILMN': 'Illumina', 'BIIB': 'Biogen', 'ALNY': 'Alnylam',
    'INCY': 'Incyte', 'NBIX': 'Neurocrine Bio', 'UTHR': 'United Therapeutics', 'JAZZ': 'Jazz Pharma',
    'SRPT': 'Sarepta', 'BMRN': 'BioMarin', 'IONS': 'Ionis Pharma', 'RGEN': 'Repligen',

    // Consumer
    'AMZN': 'Amazon', 'WMT': 'Walmart', 'COST': 'Costco', 'TGT': 'Target',
    'HD': 'Home Depot', 'LOW': "Lowe's", 'SBUX': 'Starbucks', 'MCD': "McDonald's",
    'NKE': 'Nike', 'LULU': 'Lululemon', 'DIS': 'Disney', 'NFLX': 'Netflix',
    'KO': 'Coca-Cola', 'PEP': 'PepsiCo',
    'CMG': 'Chipotle', 'YUM': 'Yum! Brands', 'ETSY': 'Etsy', 'W': 'Wayfair', 'CHWY': 'Chewy',
    'WBD': 'Warner Bros Discovery', 'FOXA': 'Fox Corp', 'CMCSA': 'Comcast',
    'T': 'AT&T', 'VZ': 'Verizon', 'TMUS': 'T-Mobile',
    'PM': 'Philip Morris', 'MO': 'Altria', 'BUD': 'AB InBev', 'TAP': 'Molson Coors',
    'STZ': 'Constellation Brands', 'MNST': 'Monster Beverage', 'CELH': 'Celsius', 'KDP': 'Keurig Dr Pepper',
    'ULTA': 'Ulta Beauty', 'ELF': 'e.l.f. Beauty', 'RH': 'RH (Restoration Hardware)',
    'DECK': 'Deckers Outdoor', 'CROX': 'Crocs', 'LEVI': "Levi Strauss", 'UAA': 'Under Armour',
    'ORLY': "O'Reilly Auto", 'AZO': 'AutoZone', 'AAP': 'Advance Auto Parts',
    'GPC': 'Genuine Parts', 'TSCO': 'Tractor Supply', 'DG': 'Dollar General', 'DLTR': 'Dollar Tree',
    'ROST': 'Ross Stores', 'TJX': 'TJX Companies', 'BBY': 'Best Buy',

    // Energy
    'XOM': 'ExxonMobil', 'CVX': 'Chevron', 'COP': 'ConocoPhillips', 'SLB': 'SLB',
    'NEE': 'NextEra Energy', 'ENPH': 'Enphase', 'FSLR': 'First Solar', 'PLUG': 'Plug Power',
    'EOG': 'EOG Resources', 'OXY': 'Occidental Petroleum', 'MPC': 'Marathon Petroleum', 'PSX': 'Phillips 66',
    'VLO': 'Valero Energy', 'TRGP': 'Targa Resources', 'DVN': 'Devon Energy', 'FANG': 'Diamondback Energy',
    'WMB': 'Williams Companies', 'APA': 'APA Corporation', 'HAL': 'Halliburton', 'BKR': 'Baker Hughes',
    'NOV': 'NOV Inc.', 'FTI': 'TechnipFMC', 'DUK': 'Duke Energy', 'SO': 'Southern Company',
    'D': 'Dominion Energy', 'AEP': 'American Electric Power', 'EXC': 'Exelon', 'OKE': 'ONEOK',
    'SEDG': 'SolarEdge', 'RUN': 'Sunrun', 'PBF': 'PBF Energy', 'DK': 'Delek US',
    'CTRA': 'Coterra Energy', 'OVV': 'Ovintiv', 'PR': 'Permian Resources', 'SM': 'SM Energy',
    'MGY': 'Magnolia Oil', 'MTDR': 'Matador Resources', 'CHRD': 'Chord Energy', 'VNOM': 'Viper Energy',
    'EQT': 'EQT Corporation', 'SMR': 'NuScale Power', 'VST': 'Vistra', 'CEG': 'Constellation Energy',
    'CCJ': 'Cameco', 'LNG': 'Cheniere Energy', 'AR': 'Antero Resources',
    'GEV': 'GE Vernova',

    // Industrials
    'BA': 'Boeing', 'CAT': 'Caterpillar', 'DE': 'Deere & Co.', 'GE': 'GE Aerospace',
    'HON': 'Honeywell', 'UPS': 'United Parcel Service', 'FDX': 'FedEx',
    'MMM': '3M', 'UNP': 'Union Pacific', 'NSC': 'Norfolk Southern', 'CSX': 'CSX Corporation',
    'CHRW': 'C.H. Robinson', 'CMI': 'Cummins', 'EMR': 'Emerson Electric', 'ETN': 'Eaton',
    'PH': 'Parker Hannifin', 'ROK': 'Rockwell Automation', 'AME': 'Ametek', 'DOV': 'Dover', 'ITW': 'Illinois Tool Works',
    'DHI': 'D.R. Horton', 'LEN': 'Lennar', 'NVR': 'NVR Inc.', 'PHM': 'PulteGroup',
    'TOL': 'Toll Brothers', 'BLD': 'TopBuild', 'BLDR': 'Builders FirstSource',
    'JBHT': 'J.B. Hunt', 'KNX': 'Knight-Swift', 'ODFL': 'Old Dominion Freight', 'XPO': 'XPO',
    'IR': 'Ingersoll Rand', 'WM': 'WM', 'RSG': 'Republic Services',
    'PCAR': 'Paccar', 'PWR': 'Quanta Services', 'JCI': 'Johnson Controls',
    'AOS': 'A.O. Smith', 'ROP': 'Roper Technologies', 'CARR': 'Carrier Global', 'VLTO': 'Veralto',
    'ROCK': 'Gibraltar Industries', 'MLI': 'Mueller Industries', 'RUSHA': 'Rush Enterprises',
    'MYRG': 'MYR Group', 'DY': 'Dycom Industries', 'APOG': 'Apogee Enterprises',

    // Real Estate
    'AMT': 'American Tower', 'PLD': 'Prologis', 'EQIX': 'Equinix', 'O': 'Realty Income',
    'CCI': 'Crown Castle', 'PSA': 'Public Storage', 'DLR': 'Digital Realty', 'WELL': 'Welltower',
    'VICI': 'VICI Properties', 'SPG': 'Simon Property', 'AVB': 'AvalonBay', 'EQR': 'Equity Residential',
    'MAA': 'Mid-America Apartment', 'UDR': 'UDR Inc.', 'CPT': 'Camden Property', 'ESS': 'Essex Property',
    'ELS': 'Equity LifeStyle', 'SUI': 'Sun Communities', 'NXRT': 'NexPoint Residential',
    'VTR': 'Ventas', 'STWD': 'Starwood Property', 'DOC': 'Healthpeak', 'OHI': 'Omega Healthcare',
    'SBRA': 'Sabra Healthcare', 'LTC': 'LTC Properties', 'HR': 'Healthcare Realty', 'MPT': 'Medical Properties Trust',
    'NHI': 'National Health Investors', 'CTRE': 'CareTrust REIT', 'IRM': 'Iron Mountain', 'CUBE': 'CubeSmart',
    'NSA': 'National Storage', 'REXR': 'Rexford Industrial',
    'TRNO': 'Terreno Realty', 'SELF': 'Global Self Storage', 'SAFE': 'Safehold',

    // Materials
    'NEM': 'Newmont', 'FCX': 'Freeport-McMoRan', 'NUE': 'Nucor', 'DOW': 'Dow Inc.',
    'USAR': 'USA Rare Earth', 'UUUU': 'Energy Fuels', 'NB': 'NioCorp Developments', 'MP': 'MP Materials',
    'GOLD': 'Gold.com', 'AU': 'AngloGold Ashanti', 'AEM': 'Agnico Eagle', 'WPM': 'Wheaton Precious Metals',
    'FNV': 'Franco-Nevada', 'RGLD': 'Royal Gold', 'KGC': 'Kinross Gold', 'HL': 'Hecla Mining',
    'STLD': 'Steel Dynamics', 'RS': 'Reliance Steel', 'CLF': 'Cleveland-Cliffs', 'MT': 'ArcelorMittal',
    'TX': 'Ternium', 'CMC': 'Commercial Metals', 'ATI': 'ATI Inc.',
    'LYB': 'LyondellBasell', 'EMN': 'Eastman Chemical', 'CE': 'Celanese', 'DD': 'DuPont',
    'APD': 'Air Products', 'LIN': 'Linde', 'ECL': 'Ecolab',
    'SHW': 'Sherwin-Williams', 'PPG': 'PPG Industries', 'RPM': 'RPM International', 'AXTA': 'Axalta Coating',
    'ALB': 'Albemarle', 'SQM': 'SQM', 'LAC': 'Lithium Americas', 'AA': 'Alcoa',
    'FUL': 'H.B. Fuller', 'NEU': 'NewMarket', 'B': 'Barrick Mining',

    // Defense
    'LMT': 'Lockheed Martin', 'RTX': 'RTX Corporation', 'NOC': 'Northrop Grumman', 'GD': 'General Dynamics',
    'LHX': 'L3Harris', 'HII': 'Huntington Ingalls', 'TXT': 'Textron', 'HWM': 'Howmet Aerospace',
    'AXON': 'Axon Enterprise', 'KTOS': 'Kratos Defense', 'AVAV': 'AeroVironment', 'AIR': 'AAR Corp',
    'SAIC': 'SAIC', 'LDOS': 'Leidos', 'CACI': 'CACI International', 'BAH': 'Booz Allen Hamilton',
    'BWXT': 'BWX Technologies', 'WWD': 'Woodward', 'TDG': 'TransDigm', 'HEI': 'HEICO',
    'CW': 'Curtiss-Wright', 'MOG.A': 'Moog', 'AIN': 'Albany International',
    'PSN': 'Parsons Corporation', 'MRCY': 'Mercury Systems', 'DRS': 'Leonardo DRS',

    // Index Funds
    'SPY': 'S&P 500 ETF', 'QQQ': 'Nasdaq 100 ETF', 'IWM': 'Russell 2000 ETF', 'VOO': 'Vanguard S&P 500'
};

// === Stock Universe: Ticker → Sector ===
const stockSectors = {
    // Tech - AI/Software
    'NVDA': 'Technology', 'AMD': 'Technology', 'GOOGL': 'Technology', 'GOOG': 'Technology',
    'META': 'Technology', 'PLTR': 'Technology', 'SNOW': 'Technology', 'MSFT': 'Technology',
    'ORCL': 'Technology', 'CRM': 'Technology', 'ADBE': 'Technology', 'NOW': 'Technology',
    'AI': 'Technology', 'BBAI': 'Technology', 'SOUN': 'Technology', 'PATH': 'Technology',
    'S': 'Technology', 'HUBS': 'Technology', 'ZM': 'Technology', 'DOCU': 'Technology',
    'TEAM': 'Technology', 'WDAY': 'Technology', 'VEEV': 'Technology', 'ESTC': 'Technology',
    'DDOG': 'Technology', 'NET': 'Technology', 'MDB': 'Technology', 'CRWD': 'Technology',
    'PANW': 'Technology', 'ZS': 'Technology', 'OKTA': 'Technology', 'CFLT': 'Technology',
    'GTLB': 'Technology', 'FROG': 'Technology', 'BILL': 'Technology', 'DOCN': 'Technology',
    'GTM': 'Technology', 'MNDY': 'Technology', 'PCOR': 'Technology', 'APP': 'Technology',
    'INTU': 'Technology',

    // Tech - Hardware/Semiconductors
    'AAPL': 'Technology', 'QCOM': 'Technology', 'INTC': 'Technology', 'MU': 'Technology',
    'ARM': 'Technology', 'AVGO': 'Technology', 'TXN': 'Technology', 'ADI': 'Technology',
    'NXPI': 'Technology', 'KLAC': 'Technology', 'ASML': 'Technology', 'TSM': 'Technology',
    'SNPS': 'Technology', 'CDNS': 'Technology', 'ON': 'Technology', 'MPWR': 'Technology',
    'SWKS': 'Technology', 'QRVO': 'Technology', 'DELL': 'Technology', 'HPQ': 'Technology',
    'AMAT': 'Technology', 'LRCX': 'Technology', 'MRVL': 'Technology', 'ENTG': 'Technology',
    'FORM': 'Technology', 'MKSI': 'Technology', 'COHR': 'Technology', 'IPGP': 'Technology',
    'LITE': 'Technology', 'AMBA': 'Technology', 'SLAB': 'Technology', 'CRUS': 'Technology',
    'SYNA': 'Technology', 'MCHP': 'Technology', 'SMCI': 'Technology', 'WDC': 'Technology',
    'STX': 'Technology', 'PSTG': 'Technology', 'NTAP': 'Technology', 'CHKP': 'Technology',
    'IONQ': 'Technology', 'RGTI': 'Technology', 'QBTS': 'Technology', 'QUBT': 'Technology',
    'ARQQ': 'Technology', 'IBM': 'Technology',
    'WOLF': 'Technology', 'OUST': 'Technology',

    // EV/Automotive
    'TSLA': 'Automotive', 'RIVN': 'Automotive', 'LCID': 'Automotive', 'NIO': 'Automotive',
    'XPEV': 'Automotive', 'LI': 'Automotive', 'F': 'Automotive', 'GM': 'Automotive',
    'STLA': 'Automotive', 'TM': 'Automotive', 'HMC': 'Automotive', 'RACE': 'Automotive',
    'VWAGY': 'Automotive', 'PSNY': 'Automotive', 'NSANY': 'Automotive',
    'MBGYY': 'Automotive', 'POAHY': 'Automotive', 'FUJHY': 'Automotive',
    'BLNK': 'Automotive', 'CHPT': 'Automotive', 'EVGO': 'Automotive',
    'PAG': 'Automotive', 'QS': 'Automotive',
    'WKHS': 'Automotive', 'ALV': 'Automotive', 'HYLN': 'Automotive',
    'JZXN': 'Automotive', 'VRM': 'Automotive',
    'CVNA': 'Automotive', 'KMX': 'Automotive', 'APTV': 'Automotive',
    'AN': 'Automotive', 'LAD': 'Automotive',

    // Finance
    'JPM': 'Financial', 'BAC': 'Financial', 'V': 'Financial', 'MA': 'Financial',
    'COIN': 'Financial', 'SOFI': 'Financial', 'PYPL': 'Financial', 'XYZ': 'Financial', 'GPN': 'Financial',
    'WFC': 'Financial', 'GS': 'Financial', 'MS': 'Financial', 'C': 'Financial',
    'BLK': 'Financial', 'SCHW': 'Financial', 'AFRM': 'Financial', 'UPST': 'Financial',
    'LC': 'Financial', 'NU': 'Financial', 'MELI': 'Financial', 'HOOD': 'Financial',
    'AXP': 'Financial', 'FIS': 'Financial', 'COF': 'Financial', 'ALLY': 'Financial',
    'USB': 'Financial', 'PNC': 'Financial', 'TFC': 'Financial', 'RF': 'Financial',
    'KEY': 'Financial', 'FITB': 'Financial', 'CFG': 'Financial', 'HBAN': 'Financial',
    'MTB': 'Financial', 'STT': 'Financial', 'BK': 'Financial', 'NTRS': 'Financial',
    'ZION': 'Financial', 'FHN': 'Financial',
    'WRB': 'Financial', 'CB': 'Financial', 'TRV': 'Financial', 'ALL': 'Financial',
    'PGR': 'Financial', 'AIG': 'Financial', 'MET': 'Financial', 'PRU': 'Financial',

    // Growth Tech/Consumer
    'DKNG': 'Technology', 'RBLX': 'Technology', 'U': 'Technology', 'PINS': 'Technology',
    'SNAP': 'Technology', 'SPOT': 'Technology', 'ABNB': 'Consumer',
    'LYFT': 'Technology', 'DASH': 'Consumer', 'UBER': 'Technology', 'CPNG': 'Consumer',
    'SHOP': 'Technology', 'SE': 'Consumer', 'BABA': 'Consumer', 'JD': 'Consumer',
    'PDD': 'Consumer', 'BKNG': 'Consumer', 'EXPE': 'Consumer', 'TCOM': 'Consumer', 'TRIP': 'Consumer',
    'PTON': 'Consumer', 'OPEN': 'Technology', 'COMP': 'Technology', 'RKT': 'Financial',
    'CWAN': 'Technology', 'DUOL': 'Technology', 'BROS': 'Consumer', 'CAVA': 'Consumer',

    // Healthcare
    'JNJ': 'Healthcare', 'UNH': 'Healthcare', 'LLY': 'Healthcare', 'PFE': 'Healthcare',
    'MRNA': 'Healthcare', 'ABBV': 'Healthcare', 'VRTX': 'Healthcare', 'REGN': 'Healthcare',
    'BMY': 'Healthcare', 'GILD': 'Healthcare', 'AMGN': 'Healthcare', 'CVS': 'Healthcare',
    'CI': 'Healthcare', 'HUM': 'Healthcare', 'ISRG': 'Healthcare', 'TMO': 'Healthcare',
    'DHR': 'Healthcare', 'ABT': 'Healthcare', 'SYK': 'Healthcare', 'BSX': 'Healthcare',
    'MDT': 'Healthcare', 'BDX': 'Healthcare', 'BAX': 'Healthcare', 'ZBH': 'Healthcare',
    'HCA': 'Healthcare', 'DVA': 'Healthcare',
    'EXAS': 'Healthcare', 'ILMN': 'Healthcare', 'BIIB': 'Healthcare', 'ALNY': 'Healthcare',
    'INCY': 'Healthcare', 'NBIX': 'Healthcare', 'UTHR': 'Healthcare', 'JAZZ': 'Healthcare',
    'SRPT': 'Healthcare', 'BMRN': 'Healthcare', 'IONS': 'Healthcare', 'RGEN': 'Healthcare',

    // Consumer
    'AMZN': 'Consumer', 'WMT': 'Consumer', 'COST': 'Consumer', 'TGT': 'Consumer',
    'HD': 'Consumer', 'LOW': 'Consumer', 'SBUX': 'Consumer', 'MCD': 'Consumer',
    'CMG': 'Consumer', 'YUM': 'Consumer', 'NKE': 'Consumer', 'LULU': 'Consumer',
    'ETSY': 'Consumer', 'W': 'Consumer', 'CHWY': 'Consumer',
    'DIS': 'Consumer', 'NFLX': 'Consumer', 'ROKU': 'Consumer', 'CARR': 'Industrials', 'WBD': 'Consumer',
    'FOXA': 'Consumer', 'CMCSA': 'Consumer', 'T': 'Consumer', 'VZ': 'Consumer', 'TMUS': 'Consumer',
    'KO': 'Consumer', 'PEP': 'Consumer', 'PM': 'Consumer', 'MO': 'Consumer',
    'BUD': 'Consumer', 'TAP': 'Consumer', 'STZ': 'Consumer', 'MNST': 'Consumer',
    'CELH': 'Consumer', 'KDP': 'Consumer', 'ULTA': 'Consumer', 'ELF': 'Consumer',
    'RH': 'Consumer', 'DECK': 'Consumer', 'CROX': 'Consumer', 'LEVI': 'Consumer',
    'UAA': 'Consumer', 'ORLY': 'Consumer', 'AZO': 'Consumer', 'AAP': 'Consumer',
    'GPC': 'Consumer', 'TSCO': 'Consumer', 'DG': 'Consumer', 'DLTR': 'Consumer',
    'ROST': 'Consumer', 'TJX': 'Consumer', 'BBY': 'Consumer',

    // Energy
    'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'SLB': 'Energy',
    'EOG': 'Energy', 'OXY': 'Energy', 'MPC': 'Energy', 'PSX': 'Energy',
    'VLO': 'Energy', 'TRGP': 'Energy', 'DVN': 'Energy', 'FANG': 'Energy',
    'WMB': 'Energy', 'APA': 'Energy', 'HAL': 'Energy', 'BKR': 'Energy',
    'NOV': 'Energy', 'FTI': 'Energy', 'NEE': 'Energy', 'DUK': 'Energy',
    'SO': 'Energy', 'D': 'Energy', 'AEP': 'Energy', 'EXC': 'Energy',
    'OKE': 'Energy',
    'ENPH': 'Energy', 'SEDG': 'Energy', 'RUN': 'Energy',
    'FSLR': 'Energy', 'PLUG': 'Energy', 'PBF': 'Energy', 'DK': 'Energy',
    'CTRA': 'Energy', 'OVV': 'Energy', 'PR': 'Energy', 'SM': 'Energy',
    'MGY': 'Energy', 'MTDR': 'Energy', 'CHRD': 'Energy', 'VNOM': 'Energy',
    'SMR': 'Energy', 'VST': 'Energy', 'CEG': 'Energy', 'CCJ': 'Energy',
    'LNG': 'Energy', 'AR': 'Energy', 'GEV': 'Energy',

    // Industrials
    'BA': 'Industrials', 'CAT': 'Industrials', 'DE': 'Industrials', 'GE': 'Industrials',
    'HON': 'Industrials', 'MMM': 'Industrials', 'UNP': 'Industrials', 'NSC': 'Industrials',
    'CSX': 'Industrials', 'UPS': 'Industrials', 'FDX': 'Industrials', 'CHRW': 'Industrials',
    'CMI': 'Industrials', 'EMR': 'Industrials', 'ETN': 'Industrials', 'PH': 'Industrials',
    'ROK': 'Industrials', 'AME': 'Industrials', 'DOV': 'Industrials', 'ITW': 'Industrials',
    'DHI': 'Industrials', 'LEN': 'Industrials', 'NVR': 'Industrials', 'PHM': 'Industrials',
    'TOL': 'Industrials', 'BLD': 'Industrials', 'BLDR': 'Industrials', 'JBHT': 'Industrials',
    'KNX': 'Industrials', 'ODFL': 'Industrials', 'XPO': 'Industrials',
    'IR': 'Industrials', 'WM': 'Industrials', 'RSG': 'Industrials',
    'PCAR': 'Industrials', 'PWR': 'Industrials', 'JCI': 'Industrials',
    'AOS': 'Industrials', 'ROP': 'Industrials',

    // Real Estate
    'AMT': 'Real Estate', 'PLD': 'Real Estate', 'CCI': 'Real Estate', 'EQIX': 'Real Estate',
    'PSA': 'Real Estate', 'DLR': 'Real Estate', 'WELL': 'Real Estate', 'O': 'Real Estate',
    'VICI': 'Real Estate', 'SPG': 'Real Estate', 'AVB': 'Real Estate', 'EQR': 'Real Estate',
    'MAA': 'Real Estate', 'UDR': 'Real Estate', 'CPT': 'Real Estate', 'ESS': 'Real Estate',
    'ELS': 'Real Estate', 'SUI': 'Real Estate', 'NXRT': 'Real Estate',
    'VTR': 'Real Estate', 'STWD': 'Real Estate', 'VLTO': 'Industrials', 'DOC': 'Real Estate', 'OHI': 'Real Estate',
    'SBRA': 'Real Estate', 'LTC': 'Real Estate', 'HR': 'Real Estate', 'MPT': 'Real Estate',
    'NHI': 'Real Estate', 'CTRE': 'Real Estate', 'IRM': 'Real Estate', 'CUBE': 'Real Estate',
    'NSA': 'Real Estate', 'REXR': 'Real Estate',
    'TRNO': 'Real Estate', 'SELF': 'Real Estate', 'SAFE': 'Real Estate',

    // Materials
    'NEM': 'Materials', 'FCX': 'Materials', 'GOLD': 'Materials', 'AU': 'Materials',
    'AEM': 'Materials', 'WPM': 'Materials', 'FNV': 'Materials', 'RGLD': 'Materials',
    'KGC': 'Materials', 'HL': 'Materials', 'NUE': 'Materials', 'STLD': 'Materials',
    'RS': 'Materials', 'CLF': 'Materials', 'MT': 'Materials',
    'TX': 'Materials', 'CMC': 'Materials', 'NB': 'Materials', 'ATI': 'Materials',
    'DOW': 'Materials', 'LYB': 'Materials', 'EMN': 'Materials', 'CE': 'Materials',
    'APD': 'Materials', 'LIN': 'Materials', 'ECL': 'Materials',
    'SHW': 'Materials', 'PPG': 'Materials', 'RPM': 'Materials', 'AXTA': 'Materials',
    'ALB': 'Materials', 'SQM': 'Materials', 'LAC': 'Materials', 'AA': 'Materials',
    'MP': 'Materials', 'DD': 'Materials', 'USAR': 'Materials',
    'FUL': 'Materials', 'NEU': 'Materials', 'UUUU': 'Materials',

    // Defense
    'LMT': 'Defense', 'RTX': 'Defense', 'NOC': 'Defense', 'GD': 'Defense',
    'LHX': 'Defense', 'HII': 'Defense', 'TXT': 'Defense', 'HWM': 'Defense',
    'AXON': 'Defense', 'KTOS': 'Defense', 'AVAV': 'Defense', 'AIR': 'Defense',
    'SAIC': 'Defense', 'LDOS': 'Defense', 'CACI': 'Defense', 'BAH': 'Defense',
    'BWXT': 'Defense', 'WWD': 'Defense', 'MOG.A': 'Defense', 'TDG': 'Defense',
    'HEI': 'Defense', 'CW': 'Defense', 'AIN': 'Defense',
    'PSN': 'Defense', 'MRCY': 'Defense', 'DRS': 'Defense',
    'EQT': 'Energy',
    // Reclassified from Defense
    'B': 'Materials',
    'ROCK': 'Industrials', 'MLI': 'Industrials', 'RUSHA': 'Industrials',
    'MYRG': 'Industrials', 'DY': 'Industrials', 'APOG': 'Industrials',
    'IMOS': 'Technology', 'VECO': 'Technology', 'POWI': 'Technology',
    'PLXS': 'Technology', 'VICR': 'Technology',

    // Index Funds (not tracked in portfolio)
    'SPY': 'Index Fund', 'QQQ': 'Index Fund', 'IWM': 'Index Fund', 'VOO': 'Index Fund'
};

// === Concurrency Throttle ===
// Simple semaphore-based throttle: max N concurrent promises at a time
const MAX_CONCURRENT = 20;
let _activeCount = 0;
const _waitQueue = [];

function _acquireSlot() {
    if (_activeCount < MAX_CONCURRENT) {
        _activeCount++;
        return Promise.resolve();
    }
    return new Promise(resolve => _waitQueue.push(resolve));
}

function _releaseSlot() {
    if (_waitQueue.length > 0) {
        const next = _waitQueue.shift();
        next();
    } else {
        _activeCount--;
    }
}

// Run an async function with concurrency throttling
async function throttled(fn) {
    await _acquireSlot();
    try {
        return await fn();
    } finally {
        _releaseSlot();
    }
}

// Run an array of async-fn-producing thunks with throttled concurrency
async function throttledAll(thunks) {
    return Promise.all(thunks.map(fn => throttled(fn)));
}

// Reset throttle state (useful for testing)
function _resetThrottle() {
    _activeCount = 0;
    _waitQueue.length = 0;
}

// === In-Memory Caches ===
// Server persists across requests, so memory caches are sufficient
const cache = {
    bulkSnapshot: { data: {}, raw: {}, ts: 0 },
    multiDay: { data: {}, ts: 0 },
    tickerDetails: { data: {}, ts: 0 },
    shortInterest: { data: {}, ts: 0 },
    news: { data: {}, ts: 0 },
    serverIndicators: { data: {}, ts: 0 },
    vix: { data: null, ts: 0 }
};

const TTL = {
    bulkSnapshot: 15 * 1000,              // 15 seconds (real-time data)
    multiDay: 30 * 60 * 1000,             // 30 minutes
    tickerDetails: 7 * 24 * 60 * 60 * 1000, // 7 days
    shortInterest: 24 * 60 * 60 * 1000,   // 24 hours
    news: 60 * 60 * 1000,                 // 1 hour
    serverIndicators: 15 * 60 * 1000,      // 15 minutes
    vix: 15 * 60 * 1000                    // 15 minutes
};

// === Helper: fetch with timeout ===
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

// === Bulk Snapshot (prices, change, vwap) ===
async function fetchBulkSnapshot(symbols, apiKey) {
    const now = Date.now();
    if (now - cache.bulkSnapshot.ts < TTL.bulkSnapshot && Object.keys(cache.bulkSnapshot.data).length > 0) {
        return cache.bulkSnapshot.data;
    }

    if (!apiKey) throw new Error('API_KEY_MISSING');

    const tickerParam = symbols.join(',');
    const response = await fetchWithTimeout(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerParam}&apiKey=${apiKey}`
    );
    const data = await response.json();

    if (data && data.status === 'OK' && data.tickers && data.tickers.length > 0) {
        const result = {};
        for (const ticker of data.tickers) {
            const symbol = ticker.ticker;
            const day = ticker.day;
            const prevDay = ticker.prevDay;
            if (!day || !prevDay) continue;

            const currentPrice = day.c || (ticker.lastTrade && ticker.lastTrade.p) || day.l;
            const prevClose = prevDay.c;
            if (!currentPrice || currentPrice === 0 || !prevClose) continue;

            const change = currentPrice - prevClose;
            const changePercent = (currentPrice - prevClose) / prevClose * 100;

            result[symbol] = {
                price: parseFloat(currentPrice),
                change: parseFloat(change),
                changePercent: parseFloat(changePercent),
                vwap: day.vw ? parseFloat(day.vw) : null,
                timestamp: new Date().toISOString(),
                isReal: true
            };

            // Store raw ticker for synthetic today bar
            cache.bulkSnapshot.raw[symbol] = ticker;
        }

        cache.bulkSnapshot.data = result;
        cache.bulkSnapshot.ts = now;
        return result;
    }

    throw new Error('Bulk snapshot failed: ' + JSON.stringify(data).substring(0, 200));
}

// === Grouped Daily Bars (~65 trading days of OHLCV) ===
async function fetchGroupedDailyBars(symbolSet, apiKey) {
    const now = Date.now();
    if (now - cache.multiDay.ts < TTL.multiDay && Object.keys(cache.multiDay.data).length > 0) {
        const hitCount = [...symbolSet].filter(s => cache.multiDay.data[s]).length;
        const sampleSyms = [...symbolSet].filter(s => cache.multiDay.data[s]).slice(0, 5);
        const avgBars = sampleSyms.length > 0
            ? sampleSyms.reduce((sum, s) => sum + (cache.multiDay.data[s]?.length || 0), 0) / sampleSyms.length
            : 0;
        if (hitCount >= symbolSet.size * 0.8 && avgBars >= 55) {
            return cache.multiDay.data;
        }
    }

    if (!apiKey) throw new Error('API_KEY_MISSING');

    const multiDayData = {};

    // Compute 80 most recent weekdays (buffer for holidays)
    const tradingDates = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    while (tradingDates.length < 80) {
        d.setDate(d.getDate() - 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            tradingDates.push(`${yyyy}-${mm}-${dd}`);
        }
    }
    tradingDates.reverse(); // Oldest first

    const BATCH = 20;
    const failedDates = [];

    async function fetchGroupedDate(dateStr) {
        return throttled(async () => {
            try {
                const response = await fetchWithTimeout(
                    `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${apiKey}`
                );
                if (!response.ok) return { dateStr, bars: [] };
                const data = await response.json();
                if (data.resultsCount === 0 || !data.results) {
                    return { dateStr, bars: [], holiday: true };
                }
                return { dateStr, bars: data.results };
            } catch (err) {
                return { dateStr, bars: [], error: err.name === 'AbortError' ? 'timeout' : err.message };
            }
        });
    }

    for (let i = 0; i < tradingDates.length; i += BATCH) {
        const batch = tradingDates.slice(i, i + BATCH);
        const batchResults = await Promise.all(batch.map(fetchGroupedDate));

        for (const result of batchResults) {
            if (result.error) { failedDates.push(result.dateStr); continue; }
            if (result.bars.length === 0) continue;
            for (const bar of result.bars) {
                if (!symbolSet.has(bar.T)) continue;
                if (!multiDayData[bar.T]) multiDayData[bar.T] = [];
                multiDayData[bar.T].push({ o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v, t: bar.t });
            }
        }
    }

    // Retry failed dates with small delay
    if (failedDates.length > 0) {
        for (const dateStr of failedDates) {
            await new Promise(r => setTimeout(r, 300));
            const result = await fetchGroupedDate(dateStr);
            if (result.bars.length > 0) {
                for (const bar of result.bars) {
                    if (!symbolSet.has(bar.T)) continue;
                    if (!multiDayData[bar.T]) multiDayData[bar.T] = [];
                    multiDayData[bar.T].push({ o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v, t: bar.t });
                }
            }
        }
    }

    // Sort each ticker's bars by timestamp ascending
    for (const sym of Object.keys(multiDayData)) {
        multiDayData[sym].sort((a, b) => a.t - b.t);
    }

    // Append synthetic bar for today from bulk snapshot's day data
    if (Object.keys(cache.bulkSnapshot.raw).length > 0) {
        for (const sym of symbolSet) {
            const raw = cache.bulkSnapshot.raw[sym];
            if (raw && raw.day && raw.day.o) {
                if (!multiDayData[sym]) multiDayData[sym] = [];
                const todayBar = { o: raw.day.o, h: raw.day.h, l: raw.day.l, c: raw.day.c, v: raw.day.v, t: Date.now() };
                const lastBar = multiDayData[sym][multiDayData[sym].length - 1];
                if (lastBar) {
                    const lastBarDate = new Date(lastBar.t).toISOString().split('T')[0];
                    const todayDate = new Date().toISOString().split('T')[0];
                    if (lastBarDate !== todayDate) {
                        multiDayData[sym].push(todayBar);
                    }
                } else {
                    multiDayData[sym].push(todayBar);
                }
            }
        }
    }

    cache.multiDay.data = multiDayData;
    cache.multiDay.ts = now;
    return multiDayData;
}

// === Ticker Details (market cap, SIC description) ===
async function fetchTickerDetails(symbols, apiKey) {
    const now = Date.now();

    // Filter to only uncached symbols (or expired cache)
    const uncached = symbols.filter(s => {
        if (!cache.tickerDetails.data[s]) return true;
        if (now - cache.tickerDetails.ts > TTL.tickerDetails) return true;
        return false;
    });

    if (uncached.length === 0) {
        return cache.tickerDetails.data;
    }

    if (!apiKey) throw new Error('API_KEY_MISSING');

    const BATCH = 50;
    for (let i = 0; i < uncached.length; i += BATCH) {
        const batch = uncached.slice(i, i + BATCH);
        await throttledAll(batch.map(symbol => async () => {
            try {
                const response = await fetchWithTimeout(
                    `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`
                );
                if (!response.ok) return;
                const data = await response.json();
                if (data.results) {
                    cache.tickerDetails.data[symbol] = {
                        marketCap: data.results.market_cap || null,
                        sicDescription: data.results.sic_description || null,
                        name: data.results.name || null,
                        sharesOutstanding: data.results.share_class_shares_outstanding || null
                    };
                }
            } catch {
                // Silently skip failed fetches
            }
        }));
    }

    cache.tickerDetails.ts = now;
    return cache.tickerDetails.data;
}

// === Short Interest ===
async function fetchShortInterest(symbols, apiKey) {
    const now = Date.now();

    if (now - cache.shortInterest.ts < TTL.shortInterest) {
        const hitCount = symbols.filter(s => cache.shortInterest.data[s]).length;
        if (hitCount >= symbols.length * 0.8) {
            return cache.shortInterest.data;
        }
    }

    if (!apiKey) throw new Error('API_KEY_MISSING');

    const uncached = symbols.filter(s => !cache.shortInterest.data[s]);
    const BATCH = 250;

    for (let i = 0; i < uncached.length; i += BATCH) {
        const batch = uncached.slice(i, i + BATCH);
        await throttled(async () => {
            try {
                const tickerParam = batch.join(',');
                const response = await fetchWithTimeout(
                    `https://api.polygon.io/stocks/v1/short-interest?ticker.any_of=${tickerParam}&order=desc&limit=1000&sort=settlement_date&apiKey=${apiKey}`
                );
                if (!response.ok) return;
                const data = await response.json();
                if (data.results) {
                    for (const entry of data.results) {
                        const sym = entry.ticker;
                        if (!cache.shortInterest.data[sym]) {
                            cache.shortInterest.data[sym] = {
                                shortInterest: entry.short_volume || entry.current_short_position || 0,
                                daysToCover: entry.days_to_cover || 0,
                                avgDailyVolume: entry.avg_daily_volume || 0,
                                settlementDate: entry.settlement_date || null
                            };
                        }
                    }
                }
            } catch {
                // Silently skip failed fetches
            }
        });
    }

    cache.shortInterest.ts = now;
    return cache.shortInterest.data;
}

// === News + Sentiment ===
async function fetchNewsForStocks(symbols, apiKey) {
    const now = Date.now();

    const uncached = symbols.filter(s => {
        if (!cache.news.data[s]) return true;
        if (now - cache.news.ts > TTL.news) return true;
        return false;
    });

    if (uncached.length === 0) {
        return cache.news.data;
    }

    if (!apiKey) throw new Error('API_KEY_MISSING');

    const BATCH = 25;
    for (let i = 0; i < uncached.length; i += BATCH) {
        const batch = uncached.slice(i, i + BATCH);
        await throttledAll(batch.map(symbol => async () => {
            try {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const response = await fetchWithTimeout(
                    `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=3&order=desc&sort=published_utc&published_utc.gte=${sevenDaysAgo}&apiKey=${apiKey}`
                );
                if (!response.ok) return;
                const data = await response.json();
                if (data.results && data.results.length > 0) {
                    cache.news.data[symbol] = data.results.map(article => {
                        const insight = (article.insights || []).find(ins => ins.ticker === symbol);
                        return {
                            title: article.title,
                            publishedUtc: article.published_utc,
                            sentiment: insight?.sentiment || null,
                            sentimentReasoning: insight?.sentiment_reasoning || null,
                            description: article.description || null,
                            publisher: article.publisher?.name || null,
                            tickers: article.tickers || []
                        };
                    });
                } else {
                    cache.news.data[symbol] = [];
                }
            } catch {
                // Silently skip failed fetches
            }
        }));
    }

    cache.news.ts = now;
    return cache.news.data;
}

// === VIX Index Data ===
// Primary: Yahoo Finance direct (server-side, no proxy needed)
// Fallback: Polygon indices snapshot
async function fetchVIX(apiKey) {
    const now = Date.now();
    if (cache.vix.data && now - cache.vix.ts < TTL.vix) {
        return cache.vix.data;
    }

    function buildVixResult(level, prevClose) {
        const change = level - prevClose;
        const changePercent = prevClose !== 0 ? ((level - prevClose) / prevClose) * 100 : 0;
        const trend = changePercent > 5 ? 'rising' : changePercent < -5 ? 'falling' : 'stable';
        let interpretation;
        if (level < 15) interpretation = 'complacent';
        else if (level <= 20) interpretation = 'normal';
        else if (level <= 30) interpretation = 'elevated';
        else interpretation = 'panic';

        const result = { level, prevClose, change, changePercent, trend, interpretation };
        cache.vix.data = result;
        cache.vix.ts = Date.now();
        return result;
    }

    // Primary: Yahoo Finance direct fetch (no CF Worker proxy needed server-side)
    try {
        const response = await fetchWithTimeout(
            'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX',
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; APEX/1.0)'
                }
            },
            10000
        );
        if (response.ok) {
            const data = await response.json();
            const meta = data.chart?.result?.[0]?.meta;
            if (meta && typeof meta.regularMarketPrice === 'number') {
                const level = meta.regularMarketPrice;
                const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? level;
                return buildVixResult(level, prevClose);
            }
        }
    } catch {
        // Fall through to Polygon fallback
    }

    // Fallback: Polygon indices snapshot
    if (apiKey) {
        try {
            const response = await fetchWithTimeout(
                `https://api.polygon.io/v3/snapshot/indices?ticker.any_of=I:VIX&apiKey=${apiKey}`,
                {},
                10000
            );
            if (response.ok) {
                const data = await response.json();
                if (data.results && data.results.length > 0) {
                    const snap = data.results[0];
                    const level = snap.value;
                    const session = snap.session || {};
                    const prevClose = session.previous_close || level;
                    return buildVixResult(level, prevClose);
                }
            }
        } catch {
            // No more fallbacks
        }
    }

    return null;
}

// === Server-Computed Indicators (RSI, MACD, SMA50 from Polygon) ===
async function fetchServerIndicators(symbols, apiKey) {
    const now = Date.now();
    if (now - cache.serverIndicators.ts < TTL.serverIndicators && Object.keys(cache.serverIndicators.data).length > 0) {
        return cache.serverIndicators.data;
    }

    if (!apiKey) return {};

    const BATCH = 25;
    for (let i = 0; i < symbols.length; i += BATCH) {
        const batch = symbols.slice(i, i + BATCH);
        await throttledAll(batch.map(symbol => async () => {
            try {
                const [rsiRes, macdRes, smaRes] = await Promise.all([
                    fetchWithTimeout(`https://api.polygon.io/v1/indicators/rsi/${symbol}?timespan=day&window=14&series_type=close&limit=1&apiKey=${apiKey}`)
                        .then(r => r.json()).catch(() => null),
                    fetchWithTimeout(`https://api.polygon.io/v1/indicators/macd/${symbol}?timespan=day&short_window=12&long_window=26&signal_window=9&series_type=close&limit=1&apiKey=${apiKey}`)
                        .then(r => r.json()).catch(() => null),
                    fetchWithTimeout(`https://api.polygon.io/v1/indicators/sma/${symbol}?timespan=day&window=50&series_type=close&limit=1&apiKey=${apiKey}`)
                        .then(r => r.json()).catch(() => null)
                ]);

                const entry = {};
                if (rsiRes?.results?.values?.[0]) {
                    entry.serverRsi = Math.round(rsiRes.results.values[0].value * 100) / 100;
                }
                if (macdRes?.results?.values?.[0]) {
                    const mv = macdRes.results.values[0];
                    entry.serverMacd = {
                        macd: Math.round((mv.value || 0) * 1000) / 1000,
                        signal: Math.round((mv.signal || 0) * 1000) / 1000,
                        histogram: Math.round((mv.histogram || 0) * 1000) / 1000
                    };
                }
                if (smaRes?.results?.values?.[0]) {
                    entry.serverSma50 = Math.round(smaRes.results.values[0].value * 100) / 100;
                }

                if (Object.keys(entry).length > 0) {
                    cache.serverIndicators.data[symbol] = entry;
                }
            } catch {
                // Silently skip failed fetches
            }
        }));
    }

    cache.serverIndicators.ts = now;
    return cache.serverIndicators.data;
}

// Expose cache for testing/debugging
function getCache() {
    return cache;
}

// Clear all caches (useful for testing or forced refresh)
function clearCache() {
    cache.bulkSnapshot = { data: {}, raw: {}, ts: 0 };
    cache.multiDay = { data: {}, ts: 0 };
    cache.tickerDetails = { data: {}, ts: 0 };
    cache.shortInterest = { data: {}, ts: 0 };
    cache.news = { data: {}, ts: 0 };
    cache.serverIndicators = { data: {}, ts: 0 };
    cache.vix = { data: null, ts: 0 };
}

module.exports = {
    stockNames,
    stockSectors,
    fetchBulkSnapshot,
    fetchGroupedDailyBars,
    fetchTickerDetails,
    fetchShortInterest,
    fetchNewsForStocks,
    fetchVIX,
    fetchServerIndicators,
    // Utilities exposed for testing
    throttled,
    throttledAll,
    getCache,
    clearCache,
    _resetThrottle
};
