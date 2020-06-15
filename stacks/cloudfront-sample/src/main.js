exports.handle = async function handle(event, context) {
  console.log("Hello!");
  return event.Records[0].cf.response;
}
