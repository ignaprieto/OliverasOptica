import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  // Ruta raíz redirige según el rol del usuario
  { 
    path: '', 
    redirectTo: 'dashboard', 
    pathMatch: 'full' 
  },

  // Login (pública)
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },

  // Dashboard (privado) - Solo para admin
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Stock - Solo para admin
  {
    path: 'stock',
    loadComponent: () =>
      import('./pages/stock/stock.component').then((m) => m.StockComponent),
    canActivate: [authGuard, roleGuard],
  },

  // Productos - Solo para admin
  {
    path: 'productos',
    loadComponent: () =>
      import('./pages/productos/productos.component').then(
        (m) => m.ProductosComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Ventas - Accesible para todos los roles autenticados
  {
    path: 'ventas',
    loadComponent: () =>
      import('./pages/ventas/ventas.component').then((m) => m.VentasComponent),
    canActivate: [authGuard],
  },

  // Descuentos - Solo para admin
  {
    path: 'descuentos',
    loadComponent: () =>
      import('./pages/descuentos/descuentos.component').then(
        (m) => m.DescuentosComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Historial - Solo para admin
  {
    path: 'historial',
    loadComponent: () =>
      import('./pages/historial/historial.component').then(
        (m) => m.HistorialComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Aumento - Solo para admin
  {
    path: 'aumento',
    loadComponent: () =>
      import('./pages/aumento/aumento.component').then(
        (m) => m.AumentoComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Finanzas - Solo para admin
  {
    path: 'finanzas',
    loadComponent: () =>
      import('./pages/finanzas/finanzas.component').then(
        (m) => m.FinanzasComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Rutas no encontradas redirigen a dashboard
  { path: '**', redirectTo: 'dashboard' },
];