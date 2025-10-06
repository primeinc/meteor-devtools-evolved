module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'eslint',
    'jest --bail --findRelatedTests --passWithNoTests',
    () => 'tsc-files --noEmit',
  ],
  '*.{js,jsx,ts,tsx,json,css,js}': ['prettier --write'],
}
