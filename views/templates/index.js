const { renderHomePage } = require("./pages/homePage");
const {
    renderRegisterPage,
    renderLoginPage,
    renderForgotPasswordPage,
    renderResetPasswordPage,
    renderVerifyEmailSentPage,
    renderTwoFactorPage,
    renderNotFoundPage
} = require("./pages/authPages");
const {
    renderComplaintPage,
    renderDashboardPage,
    renderComplaintHistoryPage,
    renderSecurityPage,
    renderPublicTrackingPage
} = require("./pages/userPages");
const { renderAdminPage, renderAnalyticsPage } = require("./pages/adminPages");

module.exports = {
    renderHomePage,
    renderRegisterPage,
    renderLoginPage,
    renderForgotPasswordPage,
    renderResetPasswordPage,
    renderVerifyEmailSentPage,
    renderTwoFactorPage,
    renderNotFoundPage,
    renderComplaintPage,
    renderDashboardPage,
    renderComplaintHistoryPage,
    renderSecurityPage,
    renderPublicTrackingPage,
    renderAdminPage,
    renderAnalyticsPage
};
