/**
 * Encapsulates functionality to execute scripts with retries, ignore exceptions etc.
 */
export default class Execute {

    /**
     * Executes the script and return the value. It ignores any exceptions that are thrown and return the default value.
     * @param scriptToExecute The script to execute.
     * @param defaultValueToReturn The default value to return in case of an exception.
     */
    public static async IgnoreException<T>(scriptToExecute: () => Promise<T>, defaultValueToReturn: T) : Promise<T> {

        try {
            return await scriptToExecute();

        } catch (e) {
            console.info("An error happened during execution of the script. Going to ignore the exception: %s", JSON.stringify(e));
        }

        return defaultValueToReturn;
    }
}