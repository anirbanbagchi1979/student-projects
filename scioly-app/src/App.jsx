import { useAuth } from './contexts/AuthContext'
import LoginScreen from './components/LoginScreen'
import QuizApp from './components/QuizApp'

const ALLOWED_EMAILS = new Set([
    'aarush.bagchi@gmail.com',
    'anirban.bagchi@gmail.com',
])

export default function App() {
    const { user, loading } = useAuth()

    if (loading) {
        return (
            <div className="app">
                <div className="loading-screen">
                    <div className="spinner"></div>
                </div>
            </div>
        )
    }

    // Double-check: even if user is set, verify email is allowed
    const isAuthorized = user && ALLOWED_EMAILS.has(user.email)

    return isAuthorized ? <QuizApp /> : <LoginScreen />
}
