# Soviet Calculator

This is the repostory for the [**Soviet Calculator**](https://wait4code.github.io/soviet-calculator/), a tool for calculating resource requirements and production ratios in the game [**Workers & Resources: Soviet Republic**](https://www.sovietrepublic.net/).

## Purpose

Soviet Calculator lets you:

- Set **production goals** (per resource: steel, cement, etc.) in number of buildings, tonnes/day, or tonnes/year
- Automatically compute the full **production chain** (buildings, quantities, personnel, mines, vehicles)
- Adjust **source quality** for mines, **year** (for electronic recipes), **charge ratio**, and **vehicle configuration** per resource
- **Save** multiple calculations (with a name), load, duplicate, or rename them
- **Share** a calculation via URL
- Use the interface in **French** or **English** (auto-detection or manual choice)

Useful for planning factories, comparing scenarios, or checking raw material needs.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- npm (included with Node.js)

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/<your-username>/soviet-calculator.git
cd soviet-calculator
npm install
```

## Run locally

```bash
npm run dev
```

The app will be available in your browser at the URL shown (usually `http://localhost:5173`).

## Other commands

- **Production build**: `npm run build`
- **Preview production build**: `npm run preview`
- **Run tests**: `npm run test`
- **Lint**: `npm run lint`

## License

Source code is distributed under **GPL-3.0** with an exception for **assets** (images, etc.), which remain the property of their respective rights holders. See [LICENSE](LICENSE) for details.

Inspired by the [Factorio Calculator](https://kirkmcdonald.github.io/calc.html).  
For the game: *Workers & Resources: Soviet Republic* © 3DIVISION.
