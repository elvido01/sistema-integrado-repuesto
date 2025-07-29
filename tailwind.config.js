/** @type {import('tailwindcss').Config} */
module.exports = {
        darkMode: 'class',
        content: [
                './index.html',
                './src/**/*.{js,jsx,ts,tsx}',
        ],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px',
			},
		},
		extend: {
			fontFamily: {
				sans: ['Inter', 'Segoe UI', 'sans-serif'],
			},
			colors: {
				'morla-lavender': '#A9A9FF',
				'morla-blue': '#003399',
				'morla-gold-start': '#F5B14A',
				'morla-gold-end': '#D88A1B',
				'morla-gray-light': '#F7F7F7',
				'morla-gray-medium': '#E0E0E0',
				'morla-gray-dark': '#333333',
                'morla-accordion': '#F0F0F0',
				'morla-dark-bg': '#1E1E2D',
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
				},
			},
			borderRadius: {
				lg: '8px',
				md: '6px',
				sm: '4px',
			},
			boxShadow: {
				'micro': '0 2px 4px rgba(0, 0, 0, 0.05)',
				'micro-hover': '0 3px 6px rgba(0, 0, 0, 0.08)',
			},
			keyframes: {
				'accordion-down': {
					from: { height: 0 },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: 0 },
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.15s ease-out',
				'accordion-up': 'accordion-up 0.15s ease-out',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
};