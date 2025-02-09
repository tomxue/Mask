const apiConfig = {
    apiKey: "sk_live_123456abcdef7890",
    secretKey: "sk_secret_abcdef123456xyz",
    baseUrl: "https://api.example.com",
    version: "v1"
};

const dbConfig = {
    username: "admin_user123",
    password: "super_secure_password",
    host: "db.example.com",
    port: 5432,
    database: "production_db"
};

const personalInfo = {
    email: "john.doe@company.com",
    ssn: "123-45-6789",
    phone: "+1 (555) 123-4567",
    dob: "1990-01-01",
    address: "123 Secret Street, Apt 4B, New York, NY 10001"
};

const paymentInfo = {
    cardNumber: "4111-1111-1111-1111",
    cvv: "123",
    expiryDate: "12/25",
    cardHolder: "John Doe"
};

const oauthConfig = {
    clientId: "oauth_client_12345",
    clientSecret: "oauth_secret_98765",
    authEndpoint: "https://auth.example.com/oauth"
};

const awsConfig = {
    accessKeyId: "AKIA1234567890ABCDEF",
    secretAccessKey: "aws_secret_key_very_long_string_here",
    region: "us-west-2"
};

const employeeData = {
    name: "Jane Smith",
    employeeId: "EMP123456",
    salary: "$120,000",
    bankAccount: "1234567890",
    routingNumber: "987654321"
};

const companySecrets = {
    mergePlanDate: "2024-06-15",
    acquisitionTarget: "TechCorp Inc",
    projectedValue: "$50M",
    internalNotes: "Proceed with caution, keep confidential until public announcement"
};

const accessCodes = {
    serverRoom: "5544123",
    vault: "98765",
    adminPanel: "admin123!@#",
    backupCodes: ["ABC123", "DEF456", "GHI789"]
};

const encryptionKeys = {
    private: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwgg...",
    public: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ...",
    mfaSecret: "JBSWY3DPEHPK3PXP"
};

const confidentialEmails = [
    "From: ceo@company.com\nTo: board@company.com\nSubject: Confidential - Q4 Layoffs\nBody: We need to reduce headcount by 15% before EOY...",
    "From: hr@company.com\nTo: management@company.com\nSubject: Salary Adjustments\nBody: The following employees will receive pay cuts...",
    "From: legal@company.com\nTo: executives@company.com\nSubject: Pending Litigation\nBody: We face potential class action lawsuit..."
];

const internalCommunication = {
    meetingNotes: "Board meeting 2024-03-15: Discussed potential bankruptcy filing...",
    projectStatus: "Project Phoenix is behind schedule, budget exceeded by $2M...",
    performanceReviews: "John Doe (Engineering): Consider termination due to recent incidents..."
};

module.exports = {
    apiConfig,
    dbConfig,
    personalInfo,
    paymentInfo,
    oauthConfig,
    awsConfig,
    employeeData,
    companySecrets,
    accessCodes,
    encryptionKeys,
    confidentialEmails,
    internalCommunication
}; 