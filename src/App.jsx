import { useAuth } from './contexts/AuthContext'
import LoginScreen from './components/LoginScreen'
import QuizApp from './components/QuizApp'

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

    return user ? <QuizApp /> : <LoginScreen />
}
