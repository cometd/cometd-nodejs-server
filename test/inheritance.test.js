/*
 * Copyright (c) 2020 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as assert from 'assert';

describe('classes', () => {
    it('inheritance', done => {
        function Base() {
            const _private = 1;

            function _internal() {
                return this.getConstant();
            }

            // "abstract" function.
            // Can be overridden in "subclasses", and invoked
            // from "superclass" via "this" (as long as subclasses
            // pass the right "this" using call()).
            this.getConstant = () => {
                throw 'abstract';
            };

            this.getBaseValue = function() {
                // return _private + this.getConstant();
                return _private + _internal.call(this);
            };

            return this;
        }

        Base.extends = parentObject => {
            // We need a fake function to
            // access the "prototype" property.
            function F() {
            }

            // Establish the inheritance chain.
            F.prototype = parentObject;
            const f = new F();
            // f -- inherits from --> F.prototype -- inherits from --> Object.prototype.
            // Now I can add functions to f.
            return f;
        };

        function Derived() {
            const _private = 5;
            const _super = new Base();
            const _self = Base.extends(_super);

            // Overriding "abstract" function.
            _self.getConstant = () => 10;

            // Overriding "concrete" function and calling super.
            _self.getBaseValue = function() {
                // Must use call() to pass "this" to super
                // in case superclass calls "abstract" functions.
                return _super.getBaseValue.call(this) + 2;
            };

            _self.getDerivedValue = function() {
                return this.getBaseValue() + _private;
            };

            return _self;
        }

        const d = new Derived();

        // 1 + 10 + 2
        assert.strictEqual(d.getBaseValue(), 13);
        // 13 + 5
        assert.strictEqual(d.getDerivedValue(), 18);

        done();
    });
});
