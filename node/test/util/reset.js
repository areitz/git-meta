/*
 * Copyright (c) 2016, Two Sigma Open Source
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of git-meta nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";

const co   = require("co");
const path = require("path");

const Reset           = require("../../lib/util/reset");
const RepoASTTestUtil = require("../../lib/util/repo_ast_test_util");

describe("reset", function () {
    describe("reset", function () {

        // We are deferring the actual reset logic to NodeGit, so we are not
        // testing the reset logic itself.  What we need to validate is that we
        // invoke `NodeGit.Reset` properly, and that we propagate the call to
        // submodules.

        const TYPE = Reset.TYPE;
        const cases = {
            "trivial soft": {
                initial: "x=S",
                to: "1",
                type: TYPE.SOFT,
            },
            "trivial mixed": {
                initial: "x=S",
                to: "1",
                type: TYPE.MIXED,
            },
            "trivial hard": {
                initial: "x=S",
                to: "1",
                type: TYPE.HARD,
            },
            "meta soft": {
                initial: "x=S:C2-1 README.md=aaa;Bfoo=2",
                to: "2",
                type: TYPE.SOFT,
                expected: "x=E:Bmaster=2;I README.md=hello world",
            },
            "meta mixed": {
                initial: "x=S:C2-1 README.md=aaa;Bfoo=2",
                to: "2",
                type: TYPE.MIXED,
                expected: "x=E:Bmaster=2;W README.md=hello world",
            },
            "meta hard": {
                initial: "x=S:C2-1 README.md=aaa;Bfoo=2",
                to: "2",
                type: TYPE.HARD,
                expected: "x=E:Bmaster=2",
            },
            "unchanged sub-repo not open": {
                initial: "a=B|x=U:C4-2 x=y;Bfoo=4",
                to: "4",
                type: TYPE.HARD,
                expected: "x=E:Bmaster=4"
            },
            "hard changed sub-repo not open": {
                initial: "a=B:Ca-1 y=x;Bfoo=a|x=U:C4-2 s=Sa:a;Bfoo=4",
                to: "4",
                type: TYPE.HARD,
                expected: "x=E:Bmaster=4"
            },
            "changed sub-repo open": {
                initial: "a=B:Ca-1 y=x;Bfoo=a|x=U:C4-2 s=Sa:a;Bfoo=4;Os",
                to: "4",
                type: TYPE.HARD,
                expected: "x=E:Bmaster=4;Os"
            },
            "changed sub-repo open, with local changes": {
                initial: "a=B:Ca-1 y=x;Bfoo=a|x=U:C4-2 s=Sa:a;Bfoo=4;Os W y=q",
                to: "4",
                type: TYPE.HARD,
                expected: "x=E:Bmaster=4;Os"
            },
            "multiple changed sub-repos open": {
                initial: `
a=B:Ca-1 y=x;Bfoo=a|x=U:C3-2 t=Sa:1;C4-3 s=Sa:a,t=Sa:a;Bfoo=4;Bmaster=3;Os;Ot`,
                to: "4",
                type: TYPE.HARD,
                expected: "x=E:Bmaster=4;Os;Ot"
            },
            "soft in sub": {
                initial: "a=B:Ca-1;Bmaster=a|x=U:C3-2 s=Sa:a;Bmaster=3;Bf=3",
                to: "2",
                type: TYPE.SOFT,
                expected: "x=E:Os H=1!I a=a;Bmaster=2",
            },
            "soft in sub, already open": {
                initial: `
a=B:Ca-1;Bmaster=a|x=U:C3-2 s=Sa:a;Bmaster=3;Bf=3;Os`,
                to: "2",
                type: TYPE.SOFT,
                expected: "x=E:Os H=1!I a=a;Bmaster=2",
            },
        };
        Object.keys(cases).forEach(caseName => {
            const c = cases[caseName];
            it(caseName, co.wrap(function *() {
                const resetter = co.wrap(function *(repos, maps) {
                    const commitId = maps.reverseCommitMap[c.to];
                    const repo = repos.x;
                    const commit = yield repo.getCommit(commitId);
                    yield Reset.reset(repo, commit, c.type);
                });
                yield RepoASTTestUtil.testMultiRepoManipulator(c.initial,
                                                               c.expected,
                                                               resetter,
                                                               c.fails);
            }));
        });
    });
    describe("resetPaths", function () {
        const cases = {
            "nothing to do": {
                initial: "x=S",
                commit: "1",
                paths: [],
            },
            "direct, but nothing": {
                initial: "x=S",
                commit: "1",
                paths: [ "README.md" ],
            },
            "reset one": {
                initial: "x=S:I README.md=3",
                commit: "1",
                paths: [ "README.md" ],
                expected: "x=S:W README.md=3",
            },
            "reset multiple": {
                initial: "x=S:C2-1;Bmaster=2;I README.md=3,2=3",
                commit: "2",
                paths: [ "README.md", "2" ],
                expected: "x=S:C2-1;Bmaster=2;W README.md=3,2=3",
            },
            "reset from another commit": {
                initial: "x=S:C2-1 README.md=8;Bfoo=2;I README.md=3",
                commit: "2",
                paths: [ "README.md" ],
                fails: true,
            },
            "in subdir": {
                initial: "x=S:C2-1 s/x=foo;Bmaster=2;I s/x=8",
                commit: "2",
                paths: [ "x" ],
                cwd: "s",
                expected: "x=E:I s/x=~;W s/x=8",
            },
            "in submodule": {
                initial: "a=B|x=U:Os I README.md=88",
                commit: "2",
                paths: [ "s" ],
                expected: "x=E:Os W README.md=88",
            },
            "in submodule, relative": {
                initial: "a=B|x=U:Os I README.md=88",
                commit: "2",
                paths: [ "README.md" ],
                cwd: "s",
                expected: "x=E:Os W README.md=88",
            },
        };
        Object.keys(cases).forEach(caseName => {
            const c = cases[caseName];
            it(caseName, co.wrap(function *() {
                const resetter = co.wrap(function *(repos, maps) {
                    const commitId = maps.reverseCommitMap[c.commit];
                    const repo = repos.x;
                    const commit = yield repo.getCommit(commitId);
                    let cwd = repo.workdir();
                    if (undefined !== c.cwd) {
                        cwd = path.join(cwd, c.cwd);
                    }
                    yield Reset.resetPaths(repo, cwd, commit, c.paths);
                });
                yield RepoASTTestUtil.testMultiRepoManipulator(c.initial,
                                                               c.expected,
                                                               resetter,
                                                               c.fails);
           }));
        });
    });
});
