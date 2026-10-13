import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import RequireAuth from './auth/RequireAuth'
import { RequireRole } from './admin/RequireRole'
import { CartProvider } from './cart/CartContext'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import CartPage from './pages/CartPage'
import './index.css'
import { AccountInfoPage, AccountLayout } from './pages/AccountPages'
import CheckoutPage from './pages/CheckoutPage'
import { MyOrderDetailPage, MyOrdersPage, OrderLookupPage, OrderSuccessPage } from './pages/OrderPages'
import { LoginPage } from './pages/AuthPages'
import { PrivacyPage, TermsPage } from './pages/LegalPages'
import { RegisterPage } from './pages/RegisterPage'
import HomePage from './pages/HomePage'
import NotFoundPage from './pages/NotFoundPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordResetPages'
import ProductDetailPage from './pages/ProductDetailPage'
import ProductsPage from './pages/ProductsPage'

/** Admin pages are loaded on demand, so shoppers never download them. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default })

const router = createBrowserRouter([
  {
    // AuthProvider lives inside the router so it can redirect to the login page when a session expires
    element: (
      <AuthProvider>
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </AuthProvider>
    ),
    children: [
      {
        // /admin/*: STAFF and ADMIN only, with its own sidebar layout
        path: '/admin',
        element: <RequireAuth roles={['STAFF', 'ADMIN']} />,
        children: [
          {
            lazy: page(() => import('./admin/AdminLayout')),
            children: [
              { index: true, lazy: page(() => import('./admin/DashboardPage')) },
              { path: 'don-hang', lazy: page(() => import('./admin/OrdersPage')) },
              { path: 'don-hang/:code', lazy: page(() => import('./admin/OrderDetailPage')) },
              { path: 'kho', lazy: page(() => import('./admin/InventoryPage')) },
              {
                // Catalogue: ADMIN only (STAFF handles orders and stock)
                element: <RequireRole roles={['ADMIN']} />,
                children: [
                  { path: 'san-pham', lazy: page(() => import('./admin/ProductsPage')) },
                  { path: 'san-pham/moi', lazy: page(() => import('./admin/ProductFormPage')) },
                  { path: 'san-pham/:id', lazy: page(() => import('./admin/ProductFormPage')) },
                  { path: 'danh-muc', lazy: page(() => import('./admin/CategoriesPage')) },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
      {
        element: (
          <CartProvider>
            <Layout />
          </CartProvider>
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
          { path: '/thanh-toan', element: <CheckoutPage /> },
          { path: '/dat-hang-thanh-cong/:code', element: <OrderSuccessPage /> },
          { path: '/tra-cuu-don-hang', element: <OrderLookupPage /> },
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
                  { path: 'don-hang', element: <MyOrdersPage /> },
                  { path: 'don-hang/:code', element: <MyOrderDetailPage /> },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
