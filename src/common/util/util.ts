/*
 * @Description 값이 nullish 또는 빈배열인지, 빈객체인지 확인하는 함수
 * is를 사용하여 타입에 대한 힌트를 적용한다.
 */
export const isEmpty = (val: unknown): val is null | undefined => {
  return (
    val === null ||
    val === undefined ||
    (Array.isArray(val) && val.length === 0) ||
    (typeof val === 'object' && Object.keys(val).length === 0)
  );
};

export const generateTimestamp = (): string => {
  const d = new Date();
  return `${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}${d.getHours()}${d.getMinutes()}${d.getSeconds()}${d.getMilliseconds()}`;
};
