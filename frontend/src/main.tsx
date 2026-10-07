import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import RequireAuth from './auth/RequireAuth'
import { CartProvider } from './cart/CartContext'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import CartPage from './pages/CartPage'
import './index.css'
import { AccountInfoPage, AccountLayout, AdminPage, OrdersPage } from './pages/AccountPages'
import { LoginPage } from './pages/AuthPages'
import { PrivacyPage, TermsPage } from './pages/LegalPages'
import { RegisterPage } from './pages/RegisterPage'
import HomePage from './pages/HomePage'
import NotFoundPage from './pages/NotFoundPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordResetPages'
import ProductDetailPage from './pages/ProductDetailPage'
import ProductsPage from './pages/ProductsPage'

const router = createBrowserRouter([
  {
    // AuthProvider lives inside the router so it can redirect to the login page when a session expires
    element: (
      <AuthProvider>
        <ToastProvider>
          <CartProvider>
            <Layout />
          </CartProvider>
        </ToastProvider>
      </AuthProvider>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/san-pham', element: <ProductsPage /> },
      { path: '/san-pham/:slug', element: <ProductDetailPage /> },
      { path: '/dang-nhap', element: <LoginPage /> },
      { path: '/dang-ky', element: <RegisterPage /> },
      { path: '/quen-mat-khau', element: <ForgotPasswordPage /> },
      { path: '/dat-lai-mat-khau', element: <ResetPasswordPage /> },
      { path: '/gio-hang', element: <CartPage /> },
      { path: '/dieu-khoan', element: <TermsPage /> },
      { path: '/chinh-sach-bao-mat', element: <PrivacyPage /> },
      {
        // /tai-khoan/*: signed-in users only
        element: <RequireAuth />,
        children: [
          {
            path: '/tai-khoan',
            element: <AccountLayout />,
            children: [
              { index: true, element: <AccountInfoPage /> },
              { path: 'don-hang', element: <OrdersPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
      {
        // /admin/*: STAFF and ADMIN only
        element: <RequireAuth roles={['STAFF', 'ADMIN']} />,
        children: [
          { path: '/admin', element: <AdminPage /> },
          { path: '/admin/*', element: <NotFoundPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
