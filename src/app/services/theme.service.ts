import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  // Signal reactivo para el tema actual
  private readonly themeSignal = signal<Theme>('light');
  
  // Getter público para acceder al signal (solo lectura)
  public readonly theme = this.themeSignal.asReadonly();

  constructor() {
    // Inicializar tema desde localStorage o usar 'light' por defecto
    this.initializeTheme();
    
    // Aplicar el tema cada vez que cambie usando effects
    effect(() => {
      this.applyTheme(this.themeSignal());
    });

    // Escuchar cambios de localStorage desde otras pestañas
    this.listenToStorageChanges();
  }

  /**
   * Inicializa el tema desde localStorage o usa el tema por defecto
   */
  private initializeTheme(): void {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
      this.themeSignal.set(savedTheme);
    } else {
      // Opcional: Detectar preferencia del sistema
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.themeSignal.set(prefersDark ? 'dark' : 'light');
    }
  }

  /**
   * Aplica el tema al documento HTML
   */
  private applyTheme(theme: Theme): void {
    const htmlElement = document.documentElement;
    
    if (theme === 'dark') {
      htmlElement.classList.add('dark');
      htmlElement.style.colorScheme = 'dark';
    } else {
      htmlElement.classList.remove('dark');
      htmlElement.style.colorScheme = 'light';
    }
    
    // Guardar en localStorage
    localStorage.setItem('theme', theme);
  }

  /**
   * Cambia el tema actual
   */
  public setTheme(theme: Theme): void {
    this.themeSignal.set(theme);
  }

  /**
   * Alterna entre tema claro y oscuro
   */
  public toggleTheme(): void {
    const currentTheme = this.themeSignal();
    this.themeSignal.set(currentTheme === 'light' ? 'dark' : 'light');
  }

  /**
   * Obtiene el valor actual del tema
   */
  public getCurrentTheme(): Theme {
    return this.themeSignal();
  }

  /**
   * Verifica si el tema actual es oscuro
   */
  public isDark(): boolean {
    return this.themeSignal() === 'dark';
  }

  /**
   * Escucha cambios en localStorage desde otras pestañas
   */
  private listenToStorageChanges(): void {
    window.addEventListener('storage', (event) => {
      if (event.key === 'theme' && event.newValue) {
        const newTheme = event.newValue as Theme;
        if (newTheme === 'light' || newTheme === 'dark') {
          this.themeSignal.set(newTheme);
        }
      }
    });
  }

  /**
   * Escucha cambios en la preferencia del sistema
   */
  public listenToSystemPreference(): void {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    darkModeQuery.addEventListener('change', (e) => {
      // Solo aplicar si no hay tema guardado en localStorage
      if (!localStorage.getItem('theme')) {
        this.themeSignal.set(e.matches ? 'dark' : 'light');
      }
    });
  }
}