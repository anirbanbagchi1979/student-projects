import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase'

const ALLOWED_EMAILS = new Set([
    'aarush.bagchi@gmail.com',
    'anirban.bagchi@gmail.com',
])

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [authError, setAuthError] = useState(null)

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
            if (u && !ALLOWED_EMAILS.has(u.email)) {
                await fbSignOut(auth)
                setUser(null)
                setAuthError('Access restricted. This account is not authorized.')
            } else {
                setUser(u)
            }
            setLoading(false)
        })
        return unsub
    }, [])

    const signInWithGoogle = async () => {
        setAuthError(null)
        const result = await signInWithPopup(auth, googleProvider)
        if (!ALLOWED_EMAILS.has(result.user.email)) {
            await fbSignOut(auth)
            const err = 'Access restricted. This account is not authorized.'
            setAuthError(err)
            throw new Error(err)
        }
    }

    const signOut = () => fbSignOut(auth)

    return (
        <AuthContext.Provider value={{ user, loading, authError, signInWithGoogle, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
