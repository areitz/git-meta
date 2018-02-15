/*
 * Copyright (c) 2017, Two Sigma Open Source
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

const assert    = require("chai").assert;
const co        = require("co");
const colors    = require("colors");
const fs        = require("fs-promise");
const mkdirp    = require("mkdirp");
const NodeGit   = require("nodegit");
const path      = require("path");

const GitUtil             = require("./git_util");
const SubmoduleConfigUtil = require("./submodule_config_util");
const TreeUtil            = require("./tree_util");
const UserError           = require("./user_error");

const writeUrls = co.wrap(function *(repo, index, urls) {
    const modulesPath = path.join(repo.workdir(),
                                  SubmoduleConfigUtil.modulesFileName);
    const newConf = SubmoduleConfigUtil.writeConfigText(urls);
    yield fs.writeFile(modulesPath, newConf);
    yield index.addByPath(SubmoduleConfigUtil.modulesFileName);
});

/**
 * Add a new (empty) submodule at the specified `filename` in the specified
 * `repo`; configure it to have the specified `url`.  If the specified
 * `importArg` is provided, import from the specified `importArg.url` and
 * checkout HEAD to the specified `importArg.branch`.
 *
 * @param {NodeGit.Repository} repo
 * @param {String}             url
 * @param {String}             filename
 * @param {Object | null}      importArg
 * @param {String}             importArg.url
 * @param {String}             importArg.branch
 */
exports.addSubmodule = co.wrap(function *(repo, url, filename, importArg) {
    assert.instanceOf(repo, NodeGit.Repository);
    assert.isString(url);
    assert.isString(filename);
    if (null !== importArg) {
        assert.isObject(importArg);
        assert.isString(importArg.url);
        assert.isString(importArg.branch);
    }
    const index = yield repo.index();
    const urls = yield SubmoduleConfigUtil.getSubmodulesFromIndex(repo, index);
    urls[filename] = url;
    yield writeUrls(repo, index, urls);
    yield index.write();

    const metaUrl = yield GitUtil.getOriginUrl(repo);
    const templatePath = yield SubmoduleConfigUtil.getTemplatePath(repo);
    const subRepo = yield SubmoduleConfigUtil.initSubmoduleAndRepo(
                                                                 metaUrl,
                                                                 repo,
                                                                 filename,
                                                                 url,
                                                                 templatePath);
    if (null === importArg) {
        return subRepo;                                               // RETURN
    }

    yield NodeGit.Remote.create(subRepo, "upstream", importArg.url);
    yield GitUtil.fetch(subRepo, "upstream");
    const remoteBranch = yield GitUtil.findRemoteBranch(subRepo,
                                                        "upstream",
                                                        importArg.branch);
    if (null === remoteBranch) {
        throw new UserError(`
The requested branch: ${colors.red(importArg.branch)} does not exist; \
try '-b [BRANCH]' to specify a different branch.`);
    }
    const commit = yield subRepo.getCommit(remoteBranch.target());
    yield GitUtil.setHeadHard(subRepo, commit);
});

/**
 * Add the specified `submodules` to the specified `index` in the
 * specified `repo` and do not open them.  Do not write out the index.
 *
 * @param {NodeGit.Repository} repo
 * @param {NodeGit.Index}      index
 * @param {Object}             submodules    name to Submodule
 */
exports.addSubmodules = co.wrap(function *(repo, index, submodules) {
    assert.instanceOf(repo, NodeGit.Repository);
    assert.instanceOf(index, NodeGit.Index);
    assert.isObject(submodules);
    if (0 === Object.keys(submodules).count) {
        return;                                                       // RETURN
    }
    const urls = yield SubmoduleConfigUtil.getSubmodulesFromIndex(repo, index);
    const changes = {};
    for (let name in submodules) {
        const sub = submodules[name];
        changes[name] = new TreeUtil.Change(NodeGit.Oid.fromString(sub.sha),
                                            NodeGit.TreeEntry.FILEMODE.COMMIT);
        urls[name] = sub.url;
        const subPath = path.join(repo.workdir(), name);
        mkdirp.sync(subPath);
    }
    const parentTreeId = yield index.writeTree();
    const parentTree = yield repo.getTree(parentTreeId);
    const newTree = yield TreeUtil.writeTree(repo, parentTree, changes);
    yield index.readTree(newTree);
    yield writeUrls(repo, index, urls);
});
