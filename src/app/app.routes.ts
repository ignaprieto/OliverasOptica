import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  // Ruta raíz redirige a login
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // Login (pública)
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },

  // Dashboard (privado)
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
    canActivate: [authGuard],
  },

  // Stock
  {
    path: 'stock',
    loadComponent: () =>
      import('./pages/stock/stock.component').then((m) => m.StockComponent),
    canActivate: [authGuard],
  },

  // Productos
  {
    path: 'productos',
    loadComponent: () =>
      import('./pages/productos/productos.component').then(
        (m) => m.ProductosComponent
      ),
    canActivate: [authGuard],
  },

  // Ventas
  {
    path: 'ventas',
    loadComponent: () =>
      import('./pages/ventas/ventas.component').then((m) => m.VentasComponent),
    canActivate: [authGuard],
  },

  // Descuentos
  {
    path: 'descuentos',
    loadComponent: () =>
      import('./pages/descuentos/descuentos.component').then(
        (m) => m.DescuentosComponent
      ),
    canActivate: [authGuard],
  },

  // Historial
  {
    path: 'historial',
    loadComponent: () =>
      import('./pages/historial/historial.component').then(
        (m) => m.HistorialComponent
      ),
    canActivate: [authGuard],
  },

  // Aumento
  {
    path: 'aumento',
    loadComponent: () =>
      import('./pages/aumento/aumento.component').then(
        (m) => m.AumentoComponent
      ),
    canActivate: [authGuard],
  },

    // Finanzas
  {
    path: 'finanzas',
    loadComponent: () =>
      import('./pages/finanzas/finanzas.component').then(
        (m) => m.FinanzasComponent
      ),
    canActivate: [authGuard],
  },

  // Rutas no encontradas redirigen a login
  { path: '**', redirectTo: 'login' },
];
