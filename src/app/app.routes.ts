import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  // Ruta raíz - redirige a login (el login manejará la redirección según rol)
  { 
    path: '', 
    redirectTo: 'login', 
    pathMatch: 'full' 
  },

  // Login (pública)
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },

  // Dashboard - Solo admin
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Stock - Solo admin
  {
    path: 'stock',
    loadComponent: () =>
      import('./pages/stock/stock.component').then((m) => m.StockComponent),
    canActivate: [authGuard, roleGuard],
  },

  // Productos - Solo admin
  {
    path: 'productos',
    loadComponent: () =>
      import('./pages/productos/productos.component').then(
        (m) => m.ProductosComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Ventas - Admin y Vendedor
  {
    path: 'ventas',
    loadComponent: () =>
      import('./pages/ventas/ventas.component').then((m) => m.VentasComponent),
    canActivate: [authGuard], // Solo requiere estar autenticado
  },

  // Descuentos - Solo admin
  {
    path: 'descuentos',
    loadComponent: () =>
      import('./pages/descuentos/descuentos.component').then(
        (m) => m.DescuentosComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Historial - Solo admin
  {
    path: 'historial',
    loadComponent: () =>
      import('./pages/historial/historial.component').then(
        (m) => m.HistorialComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Aumento - Solo admin
  {
    path: 'aumento',
    loadComponent: () =>
      import('./pages/aumento/aumento.component').then(
        (m) => m.AumentoComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Finanzas - Solo admin
  {
    path: 'finanzas',
    loadComponent: () =>
      import('./pages/finanzas/finanzas.component').then(
        (m) => m.FinanzasComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Empleados - Solo admin
  {
    path: 'empleados',
    loadComponent: () =>
      import('./pages/empleados/empleados.component').then(
        (m) => m.EmpleadosComponent
      ),
    canActivate: [authGuard, roleGuard],
  },

  // Rutas no encontradas redirigen a login
  { 
    path: '**', 
    redirectTo: 'login'
  },
];