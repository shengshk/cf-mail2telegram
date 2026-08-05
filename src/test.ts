import './mail/parse.test';
import { runForwardTests } from './mail/forward.test';

runForwardTests().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
