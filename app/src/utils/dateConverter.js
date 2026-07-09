export function solarToGregorianYear(solarYear) {

  const year = Number(solarYear);

  if (isNaN(year)) {
    return null;
  }

  if (year < 1200 || year > 1700) {
    return null;
  }

  return year + 621;

}